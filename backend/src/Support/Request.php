<?php

declare(strict_types=1);

namespace App\Support;

final class Request
{
    /** @var array<string, mixed>|null */
    private ?array $parsedBody = null;

    /** @var array<string, string> */
    public array $params = [];

    private ?int $userId = null;

    public function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public function path(): string
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $path = '/' . trim(is_string($path) ? $path : '/', '/');

        // Installs that live in a subdirectory (example.com/decks/) prefix every
        // URL with that directory; strip it so the route table stays absolute.
        $base = $this->basePath();
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = '/' . trim(substr($path, strlen($base)), '/');
        }

        return $path;
    }

    /** Directory the front controller is served from, '' when it is the web root. */
    public function basePath(): string
    {
        $directory = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? ''));

        return $directory === '/' || $directory === '.' ? '' : rtrim($directory, '/');
    }

    public function query(string $key, ?string $default = null): ?string
    {
        $value = $_GET[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : $default;
    }

    /** @return array<string, mixed> */
    public function body(): array
    {
        if ($this->parsedBody !== null) {
            return $this->parsedBody;
        }

        $raw = file_get_contents('php://input') ?: '';
        $decoded = $raw === '' ? [] : json_decode($raw, true);

        return $this->parsedBody = is_array($decoded) ? $decoded : [];
    }

    public function string(string $key, string $default = ''): string
    {
        $value = $this->body()[$key] ?? null;

        return is_scalar($value) ? trim((string) $value) : $default;
    }

    public function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';

        if (preg_match('/^Bearer\s+(\S+)$/i', (string) $header, $matches) === 1) {
            return $matches[1];
        }

        return null;
    }

    public function setUserId(int $userId): void
    {
        $this->userId = $userId;
    }

    public function userId(): int
    {
        if ($this->userId === null) {
            throw HttpException::unauthorized();
        }

        return $this->userId;
    }
}
