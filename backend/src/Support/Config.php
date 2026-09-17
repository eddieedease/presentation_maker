<?php

declare(strict_types=1);

namespace App\Support;

final class Config
{
    /** @var array<string, string>|null */
    private static ?array $fileValues = null;

    /**
     * Settings written by the web installer, if this is a hosted install.
     *
     * Docker passes everything through the environment and ships no config
     * file, so the two deployment styles never collide.
     *
     * @return array<string, string>
     */
    private static function fileValues(): array
    {
        if (self::$fileValues !== null) {
            return self::$fileValues;
        }

        $path = self::configPath();
        $values = is_file($path) ? require $path : [];

        return self::$fileValues = is_array($values) ? array_map(strval(...), $values) : [];
    }

    public static function configPath(): string
    {
        $override = getenv('APP_CONFIG_FILE');
        if (is_string($override) && $override !== '') {
            return $override;
        }

        // src/Support/Config.php -> the application root next to src/
        return dirname(__DIR__, 2) . '/config.php';
    }

    public static function isInstalled(): bool
    {
        return is_file(self::configPath());
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $value = self::fileValues()[$key] ?? getenv($key);

        if ($value === false || $value === null || $value === '') {
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
