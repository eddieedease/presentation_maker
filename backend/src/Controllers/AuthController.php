<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\EmailVerification;
use App\Support\HttpException;
use App\Support\Request;
use App\Support\Response;
use App\Support\TokenService;

final class AuthController
{
    public function register(Request $request): void
    {
        $email = mb_strtolower($request->string('email'));
        $name = $request->string('name');
        $password = $request->string('password');

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

        $pdo->prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
            ->execute([$email, $name, password_hash($password, PASSWORD_DEFAULT)]);

        $user = self::findById((int) $pdo->lastInsertId());
        $delivered = EmailVerification::send((int) $user['id'], $email, $name);

        // No tokens yet: the account is not usable until the address is confirmed.
        Response::json([
            'user'                 => self::publicUser($user),
            'verificationRequired' => true,
            'emailDelivered'       => $delivered,
        ], 201);
    }

    public function login(Request $request): void
    {
        $email = mb_strtolower($request->string('email'));
        $password = $request->string('password');

        $statement = Database::connection()->prepare('SELECT * FROM users WHERE email = ?');
        $statement->execute([$email]);
        $user = $statement->fetch();

        if ($user === false || $user['password_hash'] === null || !password_verify($password, (string) $user['password_hash'])) {
            // Same message either way so the endpoint cannot be used to enumerate accounts.
            throw HttpException::unauthorized('Email or password is incorrect.');
        }

        if ((int) $user['is_active'] !== 1) {
            throw HttpException::forbidden('This account has been disabled by an administrator.');
        }

        if ($user['email_verified_at'] === null) {
            throw new HttpException(403, 'Confirm your email address before signing in.', [
                'code'  => 'email_unverified',
                'email' => $user['email'],
            ]);
        }

        Response::json(['user' => self::publicUser($user)] + TokenService::issue($user));
    }

    /** Confirms an address and signs the user straight in. */
    public function verify(Request $request): void
    {
        $token = $request->string('token');
        if ($token === '') {
            throw HttpException::badRequest('No confirmation token was supplied.');
        }

        $user = EmailVerification::consume($token);

        if ((int) $user['is_active'] !== 1) {
            throw HttpException::forbidden('This account has been disabled by an administrator.');
        }

        Response::json(['user' => self::publicUser($user)] + TokenService::issue($user));
    }

    public function resendVerification(Request $request): void
    {
        $email = mb_strtolower($request->string('email'));

        $statement = Database::connection()->prepare('SELECT * FROM users WHERE email = ?');
        $statement->execute([$email]);
        $user = $statement->fetch();

        // Always answer the same way: this endpoint must not reveal which
        // addresses have accounts.
        if ($user !== false && $user['email_verified_at'] === null && (int) $user['is_active'] === 1) {
            if (EmailVerification::isRateLimited((int) $user['id'])) {
                throw new HttpException(429, 'A confirmation email was just sent. Check your inbox, then try again in a minute.');
            }

            EmailVerification::send((int) $user['id'], (string) $user['email'], (string) $user['name']);
        }

        Response::json(['message' => 'If that address needs confirming, a new link is on its way.']);
    }

    public function refresh(Request $request): void
    {
        $refreshToken = $request->string('refreshToken');
        if ($refreshToken === '') {
            throw HttpException::badRequest('A refresh token is required.');
        }

        Response::json(TokenService::rotate($refreshToken));
    }

    public function logout(Request $request): void
    {
        $refreshToken = $request->string('refreshToken');
        if ($refreshToken !== '') {
            TokenService::revoke($refreshToken);
        }

        Response::noContent();
    }

    public function me(Request $request): void
    {
        Response::json(['user' => self::publicUser(self::findById($request->userId()))]);
    }

    /** @return array<string, mixed> */
    public static function findById(int $id): array
    {
        $statement = Database::connection()->prepare('SELECT * FROM users WHERE id = ?');
        $statement->execute([$id]);
        $user = $statement->fetch();

        if ($user === false) {
            throw HttpException::unauthorized('Your account no longer exists.');
        }

        return $user;
    }

    /**
     * @param array<string, mixed> $user
     *
     * @return array<string, mixed>
     */
    public static function publicUser(array $user): array
    {
        return [
            'id'              => (int) $user['id'],
            'email'           => $user['email'],
            'name'            => $user['name'],
            'avatarUrl'       => $user['avatar_url'] ?? null,
            'role'            => $user['role'] ?? 'user',
            'isActive'        => (int) ($user['is_active'] ?? 1) === 1,
            'emailVerified'   => ($user['email_verified_at'] ?? null) !== null,
            'createdAt'       => $user['created_at'] ?? null,
        ];
    }
}
