<?php

declare(strict_types=1);

namespace App\Support;

use DateTimeImmutable;
use Throwable;

final class EmailVerification
{
    private const TTL_HOURS = 48;
    private const RESEND_COOLDOWN_SECONDS = 60;

    /**
     * Issues a fresh token and emails it.
     *
     * Returns false when the message could not be sent, so the caller can tell
     * the user to ask an administrator rather than silently swallowing it.
     */
    public static function send(int $userId, string $email, string $name): bool
    {
        $pdo = Database::connection();

        // Only the newest link should work.
        $pdo->prepare('UPDATE email_verifications SET consumed_at = NOW() WHERE user_id = ? AND consumed_at IS NULL')
            ->execute([$userId]);

        $token = bin2hex(random_bytes(32));
        $expiresAt = (new DateTimeImmutable())->modify('+' . self::TTL_HOURS . ' hours');

        $pdo->prepare('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
            ->execute([$userId, hash('sha256', $token), $expiresAt->format('Y-m-d H:i:s')]);

        $link = rtrim(Config::get('APP_FRONTEND_URL', 'http://localhost:4200') ?? '', '/')
            . '/verify?token=' . rawurlencode($token);

        try {
            Mailer::send(
                $email,
                $name,
                'Confirm your email address',
                self::html($name, $link),
                self::text($name, $link),
            );

            return true;
        } catch (Throwable $e) {
            error_log('[presmaker] verification email failed: ' . $e->getMessage());

            return false;
        }
    }

    /** True when the user asked for a new link too recently. */
    public static function isRateLimited(int $userId): bool
    {
        $statement = Database::connection()->prepare(
            'SELECT created_at FROM email_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1'
        );
        $statement->execute([$userId]);
        $row = $statement->fetch();

        if ($row === false) {
            return false;
        }

        return (time() - strtotime((string) $row['created_at'])) < self::RESEND_COOLDOWN_SECONDS;
    }

    /**
     * Consumes a token and marks the account verified.
     *
     * @return array<string, mixed> the verified user
     */
    public static function consume(string $token): array
    {
        $pdo = Database::connection();

        $statement = $pdo->prepare(
            'SELECT ev.id, ev.user_id, ev.expires_at, ev.consumed_at
             FROM email_verifications ev WHERE ev.token_hash = ?'
        );
        $statement->execute([hash('sha256', $token)]);
        $row = $statement->fetch();

        if ($row === false) {
            throw HttpException::badRequest('That confirmation link is not valid.');
        }
        if ($row['consumed_at'] !== null) {
            throw HttpException::badRequest('That confirmation link has already been used.');
        }
        if (strtotime((string) $row['expires_at']) < time()) {
            throw HttpException::badRequest('That confirmation link has expired. Request a new one.', ['code' => 'expired']);
        }

        $pdo->prepare('UPDATE email_verifications SET consumed_at = NOW() WHERE id = ?')->execute([(int) $row['id']]);
        $pdo->prepare('UPDATE users SET email_verified_at = NOW() WHERE id = ?')->execute([(int) $row['user_id']]);

        $user = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $user->execute([(int) $row['user_id']]);
        $found = $user->fetch();

        if ($found === false) {
            throw HttpException::badRequest('That account no longer exists.');
        }

        return $found;
    }

    private static function text(string $name, string $link): string
    {
        return "Hi {$name},\n\n"
            . "Confirm your email address to finish setting up your Presentation Maker account:\n\n"
            . "{$link}\n\n"
            . 'This link is valid for ' . self::TTL_HOURS . " hours.\n\n"
            . "If you did not create an account, you can ignore this message.\n";
    }

    private static function html(string $name, string $link): string
    {
        $safeName = htmlspecialchars($name, ENT_QUOTES);
        $safeLink = htmlspecialchars($link, ENT_QUOTES);

        return <<<HTML
            <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
              <h1 style="font-size:20px;margin:0 0 12px">Confirm your email</h1>
              <p style="margin:0 0 16px;line-height:1.6">Hi {$safeName}, confirm your email address to finish setting up your Presentation Maker account.</p>
              <p style="margin:0 0 24px">
                <a href="{$safeLink}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600">Confirm my email</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#64748b">Or paste this link into your browser:</p>
              <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="{$safeLink}" style="color:#4f46e5">{$safeLink}</a></p>
              <p style="margin:0;font-size:13px;color:#64748b">This link is valid for 48 hours. If you did not create an account, you can ignore this message.</p>
            </div>
            HTML;
    }
}
