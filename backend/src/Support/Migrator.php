<?php

declare(strict_types=1);

namespace App\Support;

use PDO;

/**
 * Brings an existing database up to the current schema.
 *
 * schema.sql only ever creates missing tables, so it cannot add a column to a
 * table that already exists. These migrations cover installs made before a
 * feature landed. Each one is recorded by name and runs at most once, and the
 * column checks make a re-run harmless even if that record is lost.
 */
final class Migrator
{
    /** @return list<string> names of the migrations that were applied */
    public static function run(PDO $pdo): array
    {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS migrations (
               id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
               name VARCHAR(191) NOT NULL,
               applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
               PRIMARY KEY (id),
               UNIQUE KEY uq_migrations_name (name)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $applied = [];
        foreach (self::migrations() as $name => $statements) {
            if (self::hasRun($pdo, $name)) {
                continue;
            }

            foreach ($statements as $statement) {
                if (is_callable($statement)) {
                    $statement($pdo);
                } else {
                    $pdo->exec($statement);
                }
            }

            $pdo->prepare('INSERT IGNORE INTO migrations (name) VALUES (?)')->execute([$name]);
            $applied[] = $name;
        }

        return $applied;
    }

    /** @return array<string, list<string|callable(PDO):void>> */
    private static function migrations(): array
    {
        return [
            'accounts_roles_and_verification' => [
                static function (PDO $pdo): void {
                    self::addColumn($pdo, 'users', 'role', "ENUM('user','admin') NOT NULL DEFAULT 'user'");
                    self::addColumn($pdo, 'users', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
                    self::addColumn($pdo, 'users', 'email_verified_at', 'DATETIME NULL');

                    // Accounts that predate verification keep working.
                    $pdo->exec('UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL');
                },
            ],
            'email_verifications_table' => [
                'CREATE TABLE IF NOT EXISTS email_verifications (
                   id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                   user_id BIGINT UNSIGNED NOT NULL,
                   token_hash CHAR(64) NOT NULL,
                   expires_at DATETIME NOT NULL,
                   consumed_at DATETIME NULL,
                   created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                   PRIMARY KEY (id),
                   UNIQUE KEY uq_verification_hash (token_hash),
                   KEY idx_verification_user (user_id),
                   CONSTRAINT fk_verification_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            ],
            'images_table' => [
                'CREATE TABLE IF NOT EXISTS images (
                   id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                   user_id BIGINT UNSIGNED NOT NULL,
                   token CHAR(32) NOT NULL,
                   original_name VARCHAR(255) NOT NULL,
                   mime VARCHAR(64) NOT NULL,
                   extension VARCHAR(8) NOT NULL,
                   width INT UNSIGNED NOT NULL,
                   height INT UNSIGNED NOT NULL,
                   bytes INT UNSIGNED NOT NULL,
                   created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                   PRIMARY KEY (id),
                   UNIQUE KEY uq_images_token (token),
                   KEY idx_images_user (user_id),
                   CONSTRAINT fk_images_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            ],
        ];
    }

    private static function hasRun(PDO $pdo, string $name): bool
    {
        $statement = $pdo->prepare('SELECT id FROM migrations WHERE name = ?');
        $statement->execute([$name]);

        return $statement->fetch() !== false;
    }

    private static function addColumn(PDO $pdo, string $table, string $column, string $definition): void
    {
        $statement = $pdo->prepare(
            'SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $statement->execute([$table, $column]);

        if ($statement->fetch() === false) {
            $pdo->exec(sprintf('ALTER TABLE `%s` ADD COLUMN `%s` %s', $table, $column, $definition));
        }
    }
}
