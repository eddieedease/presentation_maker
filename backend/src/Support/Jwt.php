<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Minimal HS256 JSON Web Token encoder/decoder.
 *
 * Deliberately dependency-free so the simulated backend runs without Composer.
 */
final class Jwt
{
    /** @param array<string, mixed> $claims */
    public static function encode(array $claims, int $ttlSeconds): string
    {
        $now = time();
        $payload = $claims + [
            'iss' => Config::get('JWT_ISSUER', 'presmaker-api'),
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + $ttlSeconds,
            'jti' => bin2hex(random_bytes(8)),
        ];

        $segments = [
            self::base64UrlEncode(self::json(['alg' => 'HS256', 'typ' => 'JWT'])),
            self::base64UrlEncode(self::json($payload)),
        ];

        $signingInput = implode('.', $segments);
        $segments[] = self::base64UrlEncode(self::sign($signingInput));

        return implode('.', $segments);
    }

    /**
     * @return array<string, mixed>
     *
     * @throws HttpException when the token is malformed, forged or expired
     */
    public static function decode(string $token): array
    {
        $segments = explode('.', $token);
        if (count($segments) !== 3) {
            throw HttpException::unauthorized('Malformed token.');
        }

        [$header64, $payload64, $signature64] = $segments;

        $expected = self::sign($header64 . '.' . $payload64);
        if (!hash_equals($expected, self::base64UrlDecode($signature64))) {
            throw HttpException::unauthorized('Token signature is invalid.');
        }

        $header = json_decode(self::base64UrlDecode($header64), true);
        if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256') {
            throw HttpException::unauthorized('Unsupported token algorithm.');
        }

        $payload = json_decode(self::base64UrlDecode($payload64), true);
        if (!is_array($payload)) {
            throw HttpException::unauthorized('Malformed token payload.');
        }

        $now = time();
        if (isset($payload['nbf']) && $now < (int) $payload['nbf']) {
            throw HttpException::unauthorized('Token is not valid yet.');
        }
        if (isset($payload['exp']) && $now >= (int) $payload['exp']) {
            throw HttpException::unauthorized('Token has expired.');
        }

        return $payload;
    }

    private static function sign(string $input): string
    {
        return hash_hmac('sha256', $input, Config::get('JWT_SECRET', 'dev-secret') ?? 'dev-secret', true);
    }

    /** @param array<string, mixed> $value */
    private static function json(array $value): string
    {
        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $value): string
    {
        $padded = str_pad(strtr($value, '-_', '+/'), (int) (ceil(strlen($value) / 4) * 4), '=');

        return base64_decode($padded, true) ?: '';
    }
}
