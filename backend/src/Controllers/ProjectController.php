<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\DeckFactory;
use App\Support\DeckNormalizer;
use App\Support\HttpException;
use App\Support\Request;
use App\Support\Response;

final class ProjectController
{
    public function index(Request $request): void
    {
        $statement = Database::connection()->prepare(
            'SELECT p.*, pub.slug, pub.published_at, pub.view_count, pub.updated_at AS published_updated_at
             FROM projects p
             LEFT JOIN publications pub ON pub.project_id = p.id
             WHERE p.user_id = ?
             ORDER BY p.updated_at DESC'
        );
        $statement->execute([$request->userId()]);

        $projects = array_map(
            static fn (array $row): array => self::present($row, withDeck: false),
            $statement->fetchAll()
        );

        Response::json(['projects' => $projects]);
    }

    public function store(Request $request): void
    {
        $title = $request->string('title');
        if ($title === '') {
            $title = 'Untitled presentation';
        }
        if (mb_strlen($title) > 200) {
            throw HttpException::badRequest('Title must be 200 characters or fewer.', ['title' => 'Too long.']);
        }

        $description = mb_substr($request->string('description'), 0, 500);
        $deck = array_key_exists('deck', $request->body())
            ? DeckNormalizer::normalize($request->body()['deck'])
            : DeckFactory::starter($title);

        $pdo = Database::connection();
        $pdo->prepare('INSERT INTO projects (user_id, title, description, deck) VALUES (?, ?, ?, ?)')
            ->execute([$request->userId(), $title, $description, self::encode($deck)]);

        Response::json(['project' => self::present(self::fetch((int) $pdo->lastInsertId(), $request->userId()))], 201);
    }

    public function show(Request $request): void
    {
        Response::json(['project' => self::present(self::fetch($this->id($request), $request->userId()))]);
    }

    public function update(Request $request): void
    {
        $id = $this->id($request);
        $project = self::fetch($id, $request->userId());
        $body = $request->body();

        $title = array_key_exists('title', $body) ? $request->string('title') : (string) $project['title'];
        if (trim($title) === '') {
            throw HttpException::badRequest('Title cannot be empty.', ['title' => 'Required.']);
        }

        $description = array_key_exists('description', $body)
            ? mb_substr($request->string('description'), 0, 500)
            : (string) $project['description'];

        $deck = array_key_exists('deck', $body)
            ? DeckNormalizer::normalize($body['deck'])
            : json_decode((string) $project['deck'], true);

        Database::connection()
            ->prepare('UPDATE projects SET title = ?, description = ?, deck = ? WHERE id = ? AND user_id = ?')
            ->execute([mb_substr(trim($title), 0, 200), $description, self::encode($deck), $id, $request->userId()]);

        Response::json(['project' => self::present(self::fetch($id, $request->userId()))]);
    }

    public function duplicate(Request $request): void
    {
        $project = self::fetch($this->id($request), $request->userId());

        $pdo = Database::connection();
        $pdo->prepare('INSERT INTO projects (user_id, title, description, deck) VALUES (?, ?, ?, ?)')
            ->execute([
                $request->userId(),
                mb_substr($project['title'] . ' (copy)', 0, 200),
                $project['description'],
                (string) $project['deck'],
            ]);

        Response::json(['project' => self::present(self::fetch((int) $pdo->lastInsertId(), $request->userId()))], 201);
    }

    public function destroy(Request $request): void
    {
        $id = $this->id($request);
        self::fetch($id, $request->userId());

        Database::connection()
            ->prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
            ->execute([$id, $request->userId()]);

        Response::noContent();
    }

    public function publish(Request $request): void
    {
        $id = $this->id($request);
        $project = self::fetch($id, $request->userId());
        $pdo = Database::connection();

        $existing = $pdo->prepare('SELECT slug FROM publications WHERE project_id = ?');
        $existing->execute([$id]);
        $row = $existing->fetch();

        // Republishing keeps the slug so already-shared links never break.
        $slug = $row !== false ? (string) $row['slug'] : $this->uniqueSlug((string) $project['title']);

        $pdo->prepare(
            'INSERT INTO publications (project_id, slug, title, deck_snapshot)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE title = VALUES(title), deck_snapshot = VALUES(deck_snapshot)'
        )->execute([$id, $slug, $project['title'], (string) $project['deck']]);

        Response::json(['publication' => self::publication(self::fetch($id, $request->userId()))]);
    }

    public function unpublish(Request $request): void
    {
        $id = $this->id($request);
        self::fetch($id, $request->userId());

        Database::connection()->prepare('DELETE FROM publications WHERE project_id = ?')->execute([$id]);

        Response::noContent();
    }

    private function uniqueSlug(string $title): string
    {
        $base = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $title) ?? '', '-'));
        $base = $base === '' ? 'deck' : mb_substr($base, 0, 40);

        $pdo = Database::connection();
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $slug = $base . '-' . bin2hex(random_bytes(4));
            $statement = $pdo->prepare('SELECT id FROM publications WHERE slug = ?');
            $statement->execute([$slug]);
            if ($statement->fetch() === false) {
                return $slug;
            }
        }

        throw HttpException::conflict('Could not allocate a public link. Please try again.');
    }

    private function id(Request $request): int
    {
        return (int) ($request->params['id'] ?? 0);
    }

    /** @return array<string, mixed> */
    private static function fetch(int $id, int $userId): array
    {
        $statement = Database::connection()->prepare(
            'SELECT p.*, pub.slug, pub.published_at, pub.view_count, pub.updated_at AS published_updated_at
             FROM projects p
             LEFT JOIN publications pub ON pub.project_id = p.id
             WHERE p.id = ? AND p.user_id = ?'
        );
        $statement->execute([$id, $userId]);
        $project = $statement->fetch();

        if ($project === false) {
            throw HttpException::notFound('That presentation does not exist.');
        }

        return $project;
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private static function present(array $row, bool $withDeck = true): array
    {
        $deck = json_decode((string) $row['deck'], true);
        $deck = is_array($deck) ? $deck : DeckNormalizer::normalize(null);

        $project = [
            'id'          => (int) $row['id'],
            'title'       => $row['title'],
            'description' => $row['description'],
            'slideCount'  => count($deck['slides'] ?? []),
            'theme'       => $deck['theme'] ?? 'night',
            'createdAt'   => $row['created_at'],
            'updatedAt'   => $row['updated_at'],
            'publication' => self::publication($row),
        ];

        if ($withDeck) {
            $project['deck'] = $deck;
        }

        return $project;
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>|null
     */
    private static function publication(array $row): ?array
    {
        if (($row['slug'] ?? null) === null) {
            return null;
        }

        return [
            'slug'        => $row['slug'],
            'path'        => '/p/' . $row['slug'],
            'publishedAt' => $row['published_at'],
            'updatedAt'   => $row['published_updated_at'] ?? null,
            'viewCount'   => (int) ($row['view_count'] ?? 0),
        ];
    }

    /** @param array<string, mixed> $deck */
    private static function encode(array $deck): string
    {
        return json_encode($deck, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}';
    }
}
