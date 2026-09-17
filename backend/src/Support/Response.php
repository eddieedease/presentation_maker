<?php

declare(strict_types=1);

namespace App\Support;

final class Response
{
    /** @param array<string, mixed>|list<mixed> $data */
    public static function json(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    public static function noContent(): void
    {
        http_response_code(204);
    }

    /** @param array<string, mixed> $details */
    public static function error(int $status, string $message, array $details = []): void
    {
        $payload = ['error' => ['status' => $status, 'message' => $message]];
        if ($details !== []) {
            $payload['error']['details'] = $details;
        }

        self::json($payload, $status);
    }

    public static function redirect(string $url): void
    {
        http_response_code(302);
        header('Location: ' . $url);
    }

    public static function applyCors(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowed = Config::list('CORS_ALLOWED_ORIGINS', 'http://localhost:4200');

        if ($origin !== '' && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
            header('Access-Control-Allow-Credentials: true');
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Max-Age: 86400');
    }
}
