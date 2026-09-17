<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\EmailVerification;
use App\Support\HttpException;
use App\Support\Request;
use App\Support\Response;

/**
 * Account administration. Every route here is registered with admin: true, so
 * the router has already established that the caller is an active admin.
 */
final class AdminController
{
    public function stats(Request $request): void
    {
        $pdo = Database::connection();
        $row = $pdo->query(
            'SELECT
               (SELECT COUNT(*) FROM users) AS users,
               (SELECT COUNT(*) FROM users WHERE is_active = 0) AS disabled,
               (SELECT COUNT(*) FROM users WHERE email_verified_at IS NULL) AS unverified,
               (SELECT COUNT(*) FROM users WHERE role = "admin") AS admins,
               (SELECT COUNT(*) FROM projects) AS projects,
               (SELECT COUNT(*) FROM publications) AS published,
               (SELECT COUNT(*) FROM images) AS images,
               (SELECT COALESCE(SUM(view_count), 0) FROM publications) AS views'
        )->fetch();

        Response::json(['stats' => array_map('intval', $row === false ? [] : $row)]);
    }

    public function index(Request $request): void
    {
        $search = $request->query('search', '') ?? '';
        $sql =
            'SELECT u.*,
                    (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS project_count,
                    (SELECT COUNT(*) FROM publications pub
                       JOIN projects p2 ON p2.id = pub.project_id WHERE p2.user_id = u.id) AS published_count
             FROM users u';
        $params = [];

        if ($search !== '') {
            $sql .= ' WHERE u.email LIKE ? OR u.name LIKE ?';
            $params = ['%' . $search . '%', '%' . $search . '%'];
        }

        $sql .= ' ORDER BY u.id ASC LIMIT 500';

        $statement = Database::connection()->prepare($sql);
        $statement->execute($params);

        Response::json(['users' => array_map(self::present(...), $statement->fetchAll())]);
    }

    public function store(Request $request): void
    {
        $email = mb_strtolower($request->string('email'));
        $name = $request->string('name');
        $password = $request->string('password');
        $role = $request->string('role', 'user') === 'admin' ? 'admin' : 'user';
        $body = $request->body();
        // An admin creating an account by hand has vouched for the address, so
        // it is confirmed unless they explicitly ask for an email to be sent.
        $sendConfirmation = ($body['sendConfirmation'] ?? false) === true;

        $errors = [];
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $errors['email'] = 'Enter a valid email address.';
        }
        if (mb_strlen($name) < 2) {
            $errors['name'] = 'Name must be at least 2 characters.';
        }
        if (mb_strlen($password) < 8) {
            $errors['password'] = 'Password must be at least 8 characters.';
        }
        if ($errors !== []) {
            throw HttpException::badRequest('Please correct the highlighted fields.', $errors);
        }

        $pdo = Database::connection();
        $exists = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $exists->execute([$email]);
        if ($exists->fetch() !== false) {
            throw HttpException::conflict('An account with that email already exists.');
        }

        $pdo->prepare(
            'INSERT INTO users (email, name, password_hash, role, email_verified_at)
             VALUES (?, ?, ?, ?, ' . ($sendConfirmation ? 'NULL' : 'NOW()') . ')'
        )->execute([$email, $name, password_hash($password, PASSWORD_DEFAULT), $role]);

        $id = (int) $pdo->lastInsertId();
        if ($sendConfirmation) {
            EmailVerification::send($id, $email, $name);
        }

        Response::json(['user' => self::present(self::fetch($id))], 201);
    }

    public function update(Request $request): void
    {
        $id = (int) ($request->params['id'] ?? 0);
        $user = self::fetch($id);
        $body = $request->body();
        $pdo = Database::connection();

        $name = array_key_exists('name', $body) ? $request->string('name') : (string) $user['name'];
        if (mb_strlen(trim($name)) < 2) {
            throw HttpException::badRequest('Name must be at least 2 characters.', ['name' => 'Too short.']);
        }

        $email = array_key_exists('email', $body) ? mb_strtolower($request->string('email')) : (string) $user['email'];
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw HttpException::badRequest('Enter a valid email address.', ['email' => 'Invalid.']);
        }
        if ($email !== $user['email']) {
            $taken = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ?');
            $taken->execute([$email, $id]);
            if ($taken->fetch() !== false) {
                throw HttpException::conflict('Another account already uses that email.');
            }
        }

        $role = array_key_exists('role', $body)
            ? ($request->string('role') === 'admin' ? 'admin' : 'user')
            : (string) $user['role'];
        $isActive = array_key_exists('isActive', $body) ? (($body['isActive'] ?? true) === true) : (int) $user['is_active'] === 1;
        $verified = array_key_exists('emailVerified', $body)
            ? (($body['emailVerified'] ?? false) === true)
            : $user['email_verified_at'] !== null;

        self::guardLastAdmin($id, $user, $role, $isActive);

        // An admin must not lock themselves out of their own session.
        if ($id === $request->userId() && (!$isActive || $role !== 'admin')) {
            throw HttpException::badRequest('You cannot remove your own administrator access or disable your own account.');
        }

        $pdo->prepare(
            'UPDATE users SET name = ?, email = ?, role = ?, is_active = ?,
                    email_verified_at = ' . ($verified ? 'COALESCE(email_verified_at, NOW())' : 'NULL') . '
             WHERE id = ?'
        )->execute([trim($name), $email, $role, $isActive ? 1 : 0, $id]);

        $password = $request->string('password');
        if ($password !== '') {
            if (mb_strlen($password) < 8) {
                throw HttpException::badRequest('Password must be at least 8 characters.', ['password' => 'Too short.']);
            }
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
            // Force the account to sign in again everywhere.
            $pdo->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL')
                ->execute([$id]);
        }

        if (!$isActive) {
            $pdo->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL')
                ->execute([$id]);
        }

        Response::json(['user' => self::present(self::fetch($id))]);
    }

    public function destroy(Request $request): void
    {
        $id = (int) ($request->params['id'] ?? 0);
        $user = self::fetch($id);

        if ($id === $request->userId()) {
            throw HttpException::badRequest('You cannot delete your own account.');
        }
        self::guardLastAdmin($id, $user, 'user', false);

        // Projects, publications, images and tokens cascade from the user row.
        Database::connection()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);

        Response::noContent();
    }

    public function resendVerification(Request $request): void
    {
        $user = self::fetch((int) ($request->params['id'] ?? 0));

        if ($user['email_verified_at'] !== null) {
            throw HttpException::badRequest('That address is already confirmed.');
        }

        $delivered = EmailVerification::send((int) $user['id'], (string) $user['email'], (string) $user['name']);

        Response::json(['emailDelivered' => $delivered]);
    }

    /** Refuses a change that would leave the site with no active administrator. */
    private static function guardLastAdmin(int $id, array $user, string $newRole, bool $newActive): void
    {
        $losingAdmin = $user['role'] === 'admin' && ($newRole !== 'admin' || !$newActive);
        if (!$losingAdmin) {
            return;
        }

        $statement = Database::connection()->prepare(
            'SELECT COUNT(*) AS remaining FROM users WHERE role = "admin" AND is_active = 1 AND id <> ?'
        );
        $statement->execute([$id]);
        $row = $statement->fetch();

        if ((int) ($row['remaining'] ?? 0) === 0) {
            throw HttpException::badRequest('This is the only active administrator. Promote someone else first.');
        }
    }

    /** @return array<string, mixed> */
    private static function fetch(int $id): array
    {
        $statement = Database::connection()->prepare(
            'SELECT u.*,
                    (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS project_count,
                    (SELECT COUNT(*) FROM publications pub
                       JOIN projects p2 ON p2.id = pub.project_id WHERE p2.user_id = u.id) AS published_count
             FROM users u WHERE u.id = ?'
        );
        $statement->execute([$id]);
        $user = $statement->fetch();

        if ($user === false) {
            throw HttpException::notFound('That account does not exist.');
        }

        return $user;
    }

    /**
     * @param array<string, mixed> $user
     *
     * @return array<string, mixed>
     */
    private static function present(array $user): array
    {
        return [
            'id'             => (int) $user['id'],
            'email'          => $user['email'],
            'name'           => $user['name'],
            'role'           => $user['role'],
            'isActive'       => (int) $user['is_active'] === 1,
            'emailVerified'  => $user['email_verified_at'] !== null,
            'hasPassword'    => $user['password_hash'] !== null,
            'projectCount'   => (int) ($user['project_count'] ?? 0),
            'publishedCount' => (int) ($user['published_count'] ?? 0),
            'createdAt'      => $user['created_at'],
        ];
    }
}
