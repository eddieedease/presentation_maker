<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Config;
use App\Support\Database;
use App\Support\DeckNormalizer;
use App\Support\HttpException;
use App\Support\Migrator;
use App\Support\Request;
use App\Support\Response;
use PDO;
use PDOException;

/**
 * Live audience sessions.
 *
 * A presenter goes live from the editor and gets a short code; phones join with
 * it, follow the current slide and answer polls and open questions. There is no
 * WebSocket here on purpose: shared PHP hosting cannot hold connections open, so
 * phones poll a tiny state endpoint instead and only download more when the
 * session's version counter has moved.
 */
final class LiveController
{
    /** No I, O, 0 or 1: a code read aloud or copied off a screen must survive confusion. */
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    private const CODE_LENGTH = 6;

    /** A live session nobody has touched for this long is treated as ended. */
    private const IDLE_HOURS = 6;
    private const KEEP_ENDED_DAYS = 30;

    private const MAX_ANSWERS_PER_PERSON = 3;
    private const MAX_ANSWER_LENGTH = 280;
    private const MAX_ANSWERS_PER_QUESTION = 1500;
    private const MAX_INTERACTIONS = 40;

    /** A phone counts as connected if it was seen within this many seconds. */
    private const CONNECTED_SECONDS = 20;

    // ------------------------------------------------------------------
    // Presenter (authenticated)
    // ------------------------------------------------------------------

    /** Starts a session for a deck, or resumes the one already live. */
    public function start(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $pdo = Database::connection();

            $statement = $pdo->prepare('SELECT id, title, deck FROM projects WHERE id = ? AND user_id = ?');
            $statement->execute([(int) ($request->params['id'] ?? 0), $request->userId()]);
            $project = $statement->fetch();
            if ($project === false) {
                throw HttpException::notFound('That presentation does not exist.');
            }

            $deck = DeckNormalizer::normalize(json_decode((string) $project['deck'], true));
            $outline = self::outline($deck);
            $snapshot = self::publicDeck($deck);

            // Housekeeping rides on starting a session, so there is no cron to set up.
            $pdo->exec(
                "UPDATE live_sessions SET status = 'ended', ended_at = NOW()
                 WHERE status = 'live' AND updated_at < NOW() - INTERVAL " . self::IDLE_HOURS . ' HOUR'
            );
            $pdo->exec(
                "DELETE FROM live_sessions
                 WHERE status = 'ended' AND ended_at < NOW() - INTERVAL " . self::KEEP_ENDED_DAYS . ' DAY'
            );

            $existing = $pdo->prepare(
                "SELECT * FROM live_sessions WHERE project_id = ? AND status = 'live' ORDER BY id DESC LIMIT 1"
            );
            $existing->execute([(int) $project['id']]);
            $session = $existing->fetch();

            if ($session !== false) {
                // Resuming picks up edits made since, but keeps every response.
                $slideIds = $outline['slides'];
                $current = in_array($session['current_slide_id'], $slideIds, true)
                    ? $session['current_slide_id']
                    : ($slideIds[0] ?? '');
                $elementIds = array_column($outline['interactions'], 'elementId');
                $closed = array_values(array_intersect(self::decode($session['closed']), $elementIds));

                $pdo->prepare(
                    'UPDATE live_sessions
                     SET title = ?, deck_snapshot = ?, outline = ?, closed = ?, current_slide_id = ?,
                         version = version + 1, rev = rev + 1, updated_at = NOW()
                     WHERE id = ?'
                )->execute([
                    $project['title'],
                    self::encode($snapshot),
                    self::encode($outline),
                    self::encode($closed),
                    $current,
                    $session['id'],
                ]);

                $this->presentOwned($this->fetchOwned((string) $session['code'], $request->userId()));

                return;
            }

            $code = $this->uniqueCode();
            $pdo->prepare(
                'INSERT INTO live_sessions
                   (project_id, user_id, code, title, current_slide_id, deck_snapshot, outline, closed)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $project['id'],
                $request->userId(),
                $code,
                $project['title'],
                $outline['slides'][0] ?? '',
                self::encode($snapshot),
                self::encode($outline),
                '[]',
            ]);

            $this->presentOwned($this->fetchOwned($code, $request->userId()), 201);
        });
    }

    /** Votes, answers and how many phones are connected, for the presenter's screen. */
    public function results(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $session = $this->fetchOwned($this->code($request), $request->userId());
            $pdo = Database::connection();
            $id = (int) $session['id'];

            // The presenter's screen is the heartbeat that keeps a session alive.
            $pdo->prepare("UPDATE live_sessions SET updated_at = NOW() WHERE id = ? AND status = 'live'")->execute([$id]);

            $results = [];
            foreach (self::decode($session['outline'])['interactions'] ?? [] as $interaction) {
                $results[$interaction['elementId']] = $interaction['kind'] === 'poll'
                    ? ['kind' => 'poll', 'counts' => array_fill(0, count($interaction['options']), 0), 'voters' => 0]
                    : ['kind' => 'question', 'answers' => []];
            }

            $rows = $pdo->prepare(
                'SELECT element_id, option_index, COUNT(*) AS votes FROM live_responses
                 WHERE session_id = ? AND option_index IS NOT NULL GROUP BY element_id, option_index'
            );
            $rows->execute([$id]);
            foreach ($rows->fetchAll() as $row) {
                $index = (int) $row['option_index'];
                if (isset($results[$row['element_id']]['counts'][$index])) {
                    $results[$row['element_id']]['counts'][$index] = (int) $row['votes'];
                }
            }

            $voters = $pdo->prepare(
                'SELECT element_id, COUNT(DISTINCT participant) AS voters FROM live_responses
                 WHERE session_id = ? AND option_index IS NOT NULL GROUP BY element_id'
            );
            $voters->execute([$id]);
            foreach ($voters->fetchAll() as $row) {
                if (isset($results[$row['element_id']])) {
                    $results[$row['element_id']]['voters'] = (int) $row['voters'];
                }
            }

            $answers = $pdo->prepare(
                'SELECT id, element_id, body, hidden FROM live_responses
                 WHERE session_id = ? AND body IS NOT NULL ORDER BY id DESC LIMIT 600'
            );
            $answers->execute([$id]);
            foreach ($answers->fetchAll() as $row) {
                if (isset($results[$row['element_id']]['answers']) && count($results[$row['element_id']]['answers']) < 120) {
                    $results[$row['element_id']]['answers'][] = [
                        'id'     => (int) $row['id'],
                        'text'   => $row['body'],
                        'hidden' => (int) $row['hidden'] === 1,
                    ];
                }
            }

            Response::json([
                'connected' => $this->connectedCount($id),
                'closed'    => self::decode($session['closed']),
                'results'   => $results,
            ]);
        });
    }

    /** Moves the audience to a slide. */
    public function slide(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $session = $this->fetchOwned($this->code($request), $request->userId());
            $slideId = $this->elementId($request->string('slideId'));

            $slides = self::decode($session['outline'])['slides'] ?? [];
            if (!in_array($slideId, $slides, true)) {
                throw HttpException::badRequest('That slide is not part of this session.');
            }

            // Skipping the write when nothing moved keeps every phone from re-downloading.
            if ($slideId !== $session['current_slide_id']) {
                Database::connection()
                    ->prepare('UPDATE live_sessions SET current_slide_id = ?, version = version + 1, updated_at = NOW() WHERE id = ?')
                    ->execute([$slideId, $session['id']]);
            }

            Response::noContent();
        });
    }

    /** Closes or reopens one poll or question to new responses. */
    public function setClosed(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $session = $this->fetchOwned($this->code($request), $request->userId());
            $elementId = $this->elementId($request->params['elementId'] ?? '');
            $this->interaction($session, $elementId);

            $closed = array_values(array_diff(self::decode($session['closed']), [$elementId]));
            if (($request->body()['closed'] ?? false) === true) {
                $closed[] = $elementId;
            }

            Database::connection()
                ->prepare('UPDATE live_sessions SET closed = ?, version = version + 1, updated_at = NOW() WHERE id = ?')
                ->execute([self::encode($closed), $session['id']]);

            Response::noContent();
        });
    }

    /** Throws away every response to one poll or question. */
    public function reset(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $session = $this->fetchOwned($this->code($request), $request->userId());
            $elementId = $this->elementId($request->params['elementId'] ?? '');
            $this->interaction($session, $elementId);

            $pdo = Database::connection();
            $pdo->prepare('DELETE FROM live_responses WHERE session_id = ? AND element_id = ?')
                ->execute([$session['id'], $elementId]);
            // Phones keep "you already answered" in the state they last fetched.
            $pdo->prepare('UPDATE live_sessions SET version = version + 1 WHERE id = ?')->execute([$session['id']]);

            Response::noContent();
        });
    }

    /** Hides one open answer from the projected screen, or shows it again. */
    public function hide(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $session = $this->fetchOwned($this->code($request), $request->userId());

            Database::connection()
                ->prepare('UPDATE live_responses SET hidden = ? WHERE id = ? AND session_id = ?')
                ->execute([($request->body()['hidden'] ?? true) === false ? 0 : 1, (int) ($request->params['id'] ?? 0), $session['id']]);

            Response::noContent();
        });
    }

    public function end(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $session = $this->fetchOwned($this->code($request), $request->userId());

            Database::connection()
                ->prepare("UPDATE live_sessions SET status = 'ended', ended_at = NOW(), version = version + 1 WHERE id = ? AND status = 'live'")
                ->execute([$session['id']]);

            Response::noContent();
        });
    }

    // ------------------------------------------------------------------
    // Audience (public: holding the code is the permission)
    // ------------------------------------------------------------------

    /** Everything a phone downloads once on joining: the deck and the session. */
    public function join(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $pdo = Database::connection();
            $statement = $pdo->prepare(
                'SELECT id, code, title, current_slide_id, version, rev, closed, deck_snapshot,
                        (status = \'live\' AND updated_at >= NOW() - INTERVAL ' . self::IDLE_HOURS . ' HOUR) AS is_live
                 FROM live_sessions WHERE code = ?'
            );
            $statement->execute([$this->code($request)]);
            $session = $statement->fetch();

            if ($session === false) {
                throw HttpException::notFound('No session uses that code. Check it and try again.');
            }

            $this->touch((int) $session['id'], $request->query('p'));

            Response::json([
                'session' => [
                    'code'        => $session['code'],
                    'title'       => $session['title'],
                    'status'      => (int) $session['is_live'] === 1 ? 'live' : 'ended',
                    'pollSeconds' => self::pollSeconds(),
                ],
                'state' => $this->audienceState($session, $request->query('p')),
                'deck'  => json_decode((string) $session['deck_snapshot'], true),
            ]);
        });
    }

    /** The small, frequently polled part. Answers `unchanged` when nothing moved. */
    public function state(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $statement = Database::connection()->prepare(
                'SELECT id, current_slide_id, version, rev, closed,
                        (status = \'live\' AND updated_at >= NOW() - INTERVAL ' . self::IDLE_HOURS . ' HOUR) AS is_live
                 FROM live_sessions WHERE code = ?'
            );
            $statement->execute([$this->code($request)]);
            $session = $statement->fetch();

            if ($session === false) {
                throw HttpException::notFound('This session no longer exists.');
            }

            $participant = $request->query('p');
            $this->touch((int) $session['id'], $participant);

            if ($request->query('v') !== null && (int) $request->query('v') === (int) $session['version']) {
                Response::json(['unchanged' => true]);

                return;
            }

            Response::json($this->audienceState($session, $participant));
        });
    }

    /** Records a poll vote or an open answer. */
    public function respond(Request $request): void
    {
        $this->guard(function () use ($request): void {
            $pdo = Database::connection();
            $statement = $pdo->prepare(
                'SELECT id, current_slide_id, outline, closed,
                        (status = \'live\' AND updated_at >= NOW() - INTERVAL ' . self::IDLE_HOURS . ' HOUR) AS is_live
                 FROM live_sessions WHERE code = ?'
            );
            $statement->execute([$this->code($request)]);
            $session = $statement->fetch();

            if ($session === false || (int) $session['is_live'] !== 1) {
                throw HttpException::conflict('This session has ended.');
            }

            $participant = $this->participant($request->string('participant'));
            if ($participant === null) {
                throw HttpException::badRequest('Reload the page and try again.');
            }

            $elementId = $this->elementId($request->string('elementId'));
            $interaction = $this->interaction($session, $elementId);

            // A phone that was a beat behind the presenter must not vote on a slide
            // the room has already left.
            if ($interaction['slideId'] !== $session['current_slide_id'] || in_array($elementId, self::decode($session['closed']), true)) {
                throw HttpException::conflict('Responses to this are closed.');
            }

            $sessionId = (int) $session['id'];
            $this->touch($sessionId, $participant);
            $body = $request->body();

            if ($interaction['kind'] === 'poll') {
                $choices = is_array($body['choices'] ?? null) ? $body['choices'] : [];
                $choices = array_values(array_unique(array_filter(
                    array_map(static fn (mixed $c): int => is_int($c) ? $c : -1, $choices),
                    static fn (int $c): bool => $c >= 0 && $c < count($interaction['options'])
                )));

                if ($choices === []) {
                    throw HttpException::badRequest('Pick an option first.');
                }
                if (!$interaction['multiple'] && count($choices) > 1) {
                    throw HttpException::badRequest('Pick just one option.');
                }

                // Changing your mind replaces the earlier vote instead of adding to it.
                $pdo->beginTransaction();
                $pdo->prepare('DELETE FROM live_responses WHERE session_id = ? AND element_id = ? AND participant = ?')
                    ->execute([$sessionId, $elementId, $participant]);
                $insert = $pdo->prepare(
                    'INSERT INTO live_responses (session_id, element_id, participant, option_index) VALUES (?, ?, ?, ?)'
                );
                foreach ($choices as $choice) {
                    $insert->execute([$sessionId, $elementId, $participant, $choice]);
                }
                $pdo->commit();

                Response::noContent();

                return;
            }

            $text = mb_substr(trim(preg_replace('/\s+/u', ' ', (string) ($body['text'] ?? '')) ?? ''), 0, self::MAX_ANSWER_LENGTH);
            if ($text === '') {
                throw HttpException::badRequest('Write an answer first.');
            }

            $counts = $pdo->prepare(
                'SELECT COUNT(*) AS everyone, COALESCE(SUM(participant = ?), 0) AS mine
                 FROM live_responses WHERE session_id = ? AND element_id = ? AND body IS NOT NULL'
            );
            $counts->execute([$participant, $sessionId, $elementId]);
            $count = $counts->fetch();

            if ((int) $count['mine'] >= self::MAX_ANSWERS_PER_PERSON) {
                throw new HttpException(429, 'You have used all of your answers for this question.');
            }
            if ((int) $count['everyone'] >= self::MAX_ANSWERS_PER_QUESTION) {
                throw new HttpException(429, 'This question has reached its limit of answers.');
            }

            $pdo->prepare('INSERT INTO live_responses (session_id, element_id, participant, body) VALUES (?, ?, ?, ?)')
                ->execute([$sessionId, $elementId, $participant, $text]);

            Response::noContent();
        });
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /**
     * Runs a handler, applying pending migrations once if the live tables are
     * missing. A hosted install upgraded by uploading new files has not run the
     * installer again, and this saves it from failing with a database error.
     */
    private function guard(callable $handler): void
    {
        try {
            $handler();
        } catch (PDOException $e) {
            if ($e->getCode() !== '42S02') {
                throw $e;
            }

            Migrator::run(Database::connection());
            $handler();
        }
    }

    /**
     * @param array<string, mixed> $session
     *
     * @return array<string, mixed>
     */
    private function audienceState(array $session, ?string $participant): array
    {
        $state = [
            'status'  => (int) $session['is_live'] === 1 ? 'live' : 'ended',
            'version' => (int) $session['version'],
            'rev'     => (int) $session['rev'],
            'slideId' => $session['current_slide_id'],
            'closed'  => self::decode($session['closed'] ?? '[]'),
            'mine'    => new \stdClass(),
        ];

        $participant = $this->participant($participant ?? '');
        if ($participant === null) {
            return $state;
        }

        $statement = Database::connection()->prepare(
            'SELECT element_id, option_index, body FROM live_responses
             WHERE session_id = ? AND participant = ? ORDER BY id'
        );
        $statement->execute([$session['id'], $participant]);

        $mine = [];
        foreach ($statement->fetchAll() as $row) {
            if ($row['option_index'] !== null) {
                $mine[$row['element_id']]['choices'][] = (int) $row['option_index'];
            } else {
                $mine[$row['element_id']]['answers'][] = $row['body'];
            }
        }
        $state['mine'] = $mine === [] ? new \stdClass() : $mine;

        return $state;
    }

    /**
     * What goes on a phone, and what the API validates against.
     *
     * @param array<string, mixed> $deck
     *
     * @return array{slides: list<string>, interactions: list<array<string, mixed>>}
     */
    private static function outline(array $deck): array
    {
        $slides = [];
        $interactions = [];

        foreach ($deck['slides'] ?? [] as $slide) {
            $slides[] = (string) $slide['id'];

            foreach ($slide['elements'] ?? [] as $element) {
                if (!in_array($element['type'], ['poll', 'question'], true) || count($interactions) >= self::MAX_INTERACTIONS) {
                    continue;
                }

                $interactions[] = [
                    'elementId' => (string) $element['id'],
                    'slideId'   => (string) $slide['id'],
                    'kind'      => $element['type'],
                    'options'   => $element['type'] === 'poll' ? array_values($element['poll']['options'] ?? []) : [],
                    'multiple'  => $element['type'] === 'poll' && ($element['poll']['multiple'] ?? false) === true,
                ];
            }
        }

        // A poll with fewer than two options has nothing to choose between.
        $interactions = array_values(array_filter(
            $interactions,
            static fn (array $i): bool => $i['kind'] !== 'poll' || count($i['options']) >= 2
        ));

        return ['slides' => $slides, 'interactions' => $interactions];
    }

    /**
     * The deck a phone is allowed to see. Speaker notes are the presenter's own.
     *
     * @param array<string, mixed> $deck
     *
     * @return array<string, mixed>
     */
    private static function publicDeck(array $deck): array
    {
        foreach ($deck['slides'] ?? [] as $index => $slide) {
            $deck['slides'][$index]['notes'] = '';
        }

        return $deck;
    }

    /**
     * @param array<string, mixed> $session
     *
     * @return array<string, mixed>
     */
    private function interaction(array $session, string $elementId): array
    {
        foreach (self::decode($session['outline'])['interactions'] ?? [] as $interaction) {
            if ($interaction['elementId'] === $elementId) {
                return $interaction;
            }
        }

        throw HttpException::notFound('That question is not part of this session.');
    }

    /** Records that a phone is still there, at most once per few seconds per phone. */
    private function touch(int $sessionId, ?string $participant): void
    {
        $participant = $this->participant($participant ?? '');
        if ($participant === null) {
            return;
        }

        Database::connection()->prepare(
            'INSERT INTO live_participants (session_id, participant) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE last_seen = IF(last_seen < NOW() - INTERVAL 5 SECOND, NOW(), last_seen)'
        )->execute([$sessionId, $participant]);
    }

    private function connectedCount(int $sessionId): int
    {
        $statement = Database::connection()->prepare(
            'SELECT COUNT(*) FROM live_participants WHERE session_id = ? AND last_seen >= NOW() - INTERVAL ' . self::CONNECTED_SECONDS . ' SECOND'
        );
        $statement->execute([$sessionId]);

        return (int) $statement->fetchColumn();
    }

    /** @return array<string, mixed> */
    private function fetchOwned(string $code, int $userId): array
    {
        $statement = Database::connection()->prepare('SELECT * FROM live_sessions WHERE code = ? AND user_id = ?');
        $statement->execute([$code, $userId]);
        $session = $statement->fetch();

        if ($session === false) {
            throw HttpException::notFound('That live session does not exist.');
        }

        return $session;
    }

    /** @param array<string, mixed> $session */
    private function presentOwned(array $session, int $status = 200): void
    {
        Response::json([
            'session' => [
                'code'        => $session['code'],
                'title'       => $session['title'],
                'status'      => $session['status'],
                'slideId'     => $session['current_slide_id'],
                'startedAt'   => $session['started_at'],
                'pollSeconds' => self::pollSeconds(),
            ],
        ], $status);
    }

    private function code(Request $request): string
    {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $request->params['code'] ?? '') ?? '');

        // Reject anything that cannot be a code before it reaches the database.
        if (strlen($code) !== self::CODE_LENGTH || strspn($code, self::CODE_ALPHABET) !== self::CODE_LENGTH) {
            throw HttpException::notFound('No session uses that code. Check it and try again.');
        }

        return $code;
    }

    private function uniqueCode(): string
    {
        $pdo = Database::connection();
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $code = '';
            for ($i = 0; $i < self::CODE_LENGTH; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }

            $statement = $pdo->prepare('SELECT id FROM live_sessions WHERE code = ?');
            $statement->execute([$code]);
            if ($statement->fetch() === false) {
                return $code;
            }
        }

        throw HttpException::conflict('Could not allocate a join code. Please try again.');
    }

    private function elementId(mixed $value): string
    {
        $value = is_string($value) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $value) : '';

        return mb_substr((string) $value, 0, 40);
    }

    /** A phone's anonymous, self-chosen handle. It identifies a browser, not a person. */
    private function participant(string $value): ?string
    {
        return preg_match('/^[a-f0-9]{16,32}$/', $value) === 1 ? $value : null;
    }

    private static function pollSeconds(): int
    {
        return max(1, min(30, Config::int('LIVE_POLL_SECONDS', 2)));
    }

    /** @return array<mixed> */
    private static function decode(mixed $json): array
    {
        $decoded = is_string($json) ? json_decode($json, true) : null;

        return is_array($decoded) ? $decoded : [];
    }

    private static function encode(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '[]';
    }
}
