<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\HttpException;
use App\Support\Request;
use App\Support\Response;

final class PublicController
{
    /** Serves a published deck to anyone holding the link. No authentication. */
    public function show(Request $request): void
    {
        $slug = preg_replace('/[^a-z0-9-]/i', '', $request->params['slug'] ?? '') ?? '';
        if ($slug === '') {
            throw HttpException::notFound('That presentation link is not valid.');
        }

        $pdo = Database::connection();
        $statement = $pdo->prepare(
            'SELECT pub.slug, pub.title, pub.deck_snapshot, pub.published_at, pub.updated_at, u.name AS author
             FROM publications pub
             JOIN projects p ON p.id = pub.project_id
             JOIN users u ON u.id = p.user_id
             WHERE pub.slug = ?'
        );
        $statement->execute([$slug]);
        $publication = $statement->fetch();

        if ($publication === false) {
            throw HttpException::notFound('This presentation is not published, or the link has been revoked.');
        }

        $pdo->prepare('UPDATE publications SET view_count = view_count + 1 WHERE slug = ?')->execute([$slug]);

        Response::json([
            'presentation' => [
                'slug'        => $publication['slug'],
                'title'       => $publication['title'],
                'author'      => $publication['author'],
                'publishedAt' => $publication['published_at'],
                'updatedAt'   => $publication['updated_at'],
                'deck'        => json_decode((string) $publication['deck_snapshot'], true),
            ],
        ]);
    }
}
