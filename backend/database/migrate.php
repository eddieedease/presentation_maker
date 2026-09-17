<?php

/**
 * Applies pending migrations from the command line.
 *
 *   docker compose exec api php database/migrate.php
 *
 * The web installer runs the same migrations, so this is only needed for a
 * development database that is already up.
 */

declare(strict_types=1);

$appDir = dirname(__DIR__);

spl_autoload_register(static function (string $class) use ($appDir): void {
    if (str_starts_with($class, 'App\\')) {
        $path = $appDir . '/src/' . str_replace('\\', '/', substr($class, 4)) . '.php';
        if (is_file($path)) {
            require $path;
        }
    }
});

$applied = App\Support\Migrator::run(App\Support\Database::connection());

echo $applied === []
    ? "Database is already up to date." . PHP_EOL
    : "Applied: " . implode(', ', $applied) . PHP_EOL;
