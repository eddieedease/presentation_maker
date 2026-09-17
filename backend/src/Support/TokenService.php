<?php

declare(strict_types=1);

namespace App\Support;

use DateTimeImmutable;

final class TokenService
{
    /**
     * Issues a short-lived access JWT plus an opaque rotating refresh token.
     *
     * Only the SHA-256 hash of the refresh token is stored, so a database leak
     * does not hand out usable sessions.
     *
     * @param array<string, mixed> $user
     *
     * @return array<string, mixed>
     */
    public static function issue(array $user): array
    {
        $accessTtl = Config::int('ACCESS_TOKEN_TTL', 900);
        $refreshTtl = Config::int('REFRESH_TOKEN_TTL', 1209600);

        $accessToken = Jwt::encode([
            'sub'   => (int) $user['id'],
            'typ'   => 'access',
            'email' => $user['email'],
            'name'  => $user['name'],
        ], $accessTtl);

        $refreshToken = bin2hex(random_bytes(32));
        $expiresAt = (new DateTimeImmutable())->modify('+' . $refreshTtl . ' seconds');

        Database::connection()
            ->prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
            ->execute([(int) $user['id'], hash('sha256', $refreshToken), $expiresAt->format('Y-m-d H:i:s')]);

        return [
            'accessToken'  => $accessToken,
            'refreshToken' => $refreshToken,
            'expiresIn'    => $accessTtl,
            'tokenType'    => 'Bearer',
        ];
    }

    /**
     * Consumes a refresh token and issues a fresh pair (refresh rotation).
     *
     * @return array<string, mixed>
     */
    public static function rotate(string $refreshToken): array
    {
        $pdo = Database::connection();
        $hash = hash('sha256', $refreshToken);

        $statement = $pdo->prepare(
            'SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email, u.name
             FROM refresh_tokens rt
             JOIN users u ON u.id = rt.user_id
             WHERE rt.token_hash = ?'
        );
        $statement->execute([$hash]);
        $row = $statement->fetch();

        if ($row === false || $row['revoked_at'] !== null || strtotime((string) $row['expires_at']) < time()) {
            throw HttpException::unauthorized('Refresh token is invalid or expired.');
        }

        $pdo->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?')->execute([(int) $row['id']]);

        return self::issue(['id' => $row['user_id'], 'email' => $row['email'], 'name' => $row['name']]);
    }

    public static function revoke(string $refreshToken): void
    {
        Database::connection()
            ->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL')
            ->execute([hash('sha256', $refreshToken)]);
    }
}
