<?php

declare(strict_types=1);

namespace App\Support;

final class Config
{
    public static function get(string $key, ?string $default = null): ?string
    {
        $value = getenv($key);
        if ($value === false || $value === '') {
            return $default;
        }

        return $value;
    }

    public static function int(string $key, int $default): int
    {
        $value = self::get($key);

        return $value === null ? $default : (int) $value;
    }

    /** @return list<string> */
    public static function list(string $key, string $default = ''): array
    {
        $value = self::get($key, $default) ?? '';

        return array_values(array_filter(array_map('trim', explode(',', $value))));
    }
}
