<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

final class HttpException extends RuntimeException
{
    /** @param array<string, mixed> $details */
    public function __construct(
        private readonly int $status,
        string $message,
        private readonly array $details = [],
    ) {
        parent::__construct($message);
    }

    public function status(): int
    {
        return $this->status;
    }

    /** @return array<string, mixed> */
    public function details(): array
    {
        return $this->details;
    }

    /** @param array<string, mixed> $details */
    public static function badRequest(string $message, array $details = []): self
    {
        return new self(400, $message, $details);
    }

    public static function unauthorized(string $message = 'Authentication required.'): self
    {
        return new self(401, $message);
    }

    public static function forbidden(string $message = 'You do not have access to this resource.'): self
    {
        return new self(403, $message);
    }

    public static function notFound(string $message = 'Resource not found.'): self
    {
        return new self(404, $message);
    }

    public static function conflict(string $message): self
    {
        return new self(409, $message);
    }
}
