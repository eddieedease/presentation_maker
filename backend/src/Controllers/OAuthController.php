<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Config;
use App\Support\Database;
use App\Support\HttpException;
use App\Support\Jwt;
use App\Support\Request;
use App\Support\Response;
use App\Support\TokenService;

/**
 * OAuth 2.0 authorization-code flow for Google and GitHub.
 *
 * CSRF state is a short-lived signed JWT rather than a server session, so the
 * API stays stateless.
 */
final class OAuthController
{
    private const PROVIDERS = [
        'google' => [
            'authorize' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'token'     => 'https://oauth2.googleapis.com/token',
            'userinfo'  => 'https://openidconnect.googleapis.com/v1/userinfo',
            'scope'     => 'openid email profile',
        ],
        'github' => [
            'authorize' => 'https://github.com/login/oauth/authorize',
            'token'     => 'https://github.com/login/oauth/access_token',
            'userinfo'  => 'https://api.github.com/user',
            'scope'     => 'read:user user:email',
        ],
    ];

    public function providers(Request $request): void
    {
        $available = [];
        foreach (array_keys(self::PROVIDERS) as $provider) {
            $available[] = [
                'id'         => $provider,
                'label'      => ucfirst($provider),
                'configured' => self::credentials($provider) !== null,
            ];
        }

        Response::json(['providers' => $available]);
    }

    public function start(Request $request): void
    {
        $provider = $this->provider($request);
        $credentials = self::credentials($provider);

        if ($credentials === null) {
            Response::redirect($this->frontendUrl('/login?oauth_error=' . rawurlencode($provider . ' sign-in is not configured on this server.')));

            return;
        }

        $state = Jwt::encode(['typ' => 'oauth_state', 'provider' => $provider], 600);

        $query = http_build_query([
            'client_id'     => $credentials['client_id'],
            'redirect_uri'  => $credentials['redirect_uri'],
            'response_type' => 'code',
            'scope'         => self::PROVIDERS[$provider]['scope'],
            'state'         => $state,
            'access_type'   => 'offline',
            'prompt'        => 'select_account',
        ]);

        Response::redirect(self::PROVIDERS[$provider]['authorize'] . '?' . $query);
    }

    public function callback(Request $request): void
    {
        $provider = $this->provider($request);

        try {
            $code = $request->query('code');
            $state = $request->query('state');

            if ($code === null || $state === null) {
                throw HttpException::badRequest('The provider did not return an authorization code.');
            }

            $claims = Jwt::decode($state);
            if (($claims['typ'] ?? null) !== 'oauth_state' || ($claims['provider'] ?? null) !== $provider) {
                throw HttpException::badRequest('The sign-in state could not be verified. Please try again.');
            }

            $profile = $this->exchange($provider, $code);
            $user = $this->upsertUser($provider, $profile);
            $tokens = TokenService::issue($user);

            // Tokens travel in the URL fragment: fragments are never sent to a
            // server, so they stay out of access logs and referrer headers.
            $fragment = http_build_query([
                'accessToken'  => $tokens['accessToken'],
                'refreshToken' => $tokens['refreshToken'],
                'expiresIn'    => $tokens['expiresIn'],
            ]);

            Response::redirect($this->frontendUrl('/auth/callback') . '#' . $fragment);
        } catch (HttpException $e) {
            Response::redirect($this->frontendUrl('/login?oauth_error=' . rawurlencode($e->getMessage())));
        }
    }

    /**
     * @return array{id: string, email: string, name: string, avatar: ?string}
     */
    private function exchange(string $provider, string $code): array
    {
        $credentials = self::credentials($provider);
        if ($credentials === null) {
            throw HttpException::badRequest(ucfirst($provider) . ' sign-in is not configured on this server.');
        }

        $tokenResponse = $this->httpPost(self::PROVIDERS[$provider]['token'], [
            'client_id'     => $credentials['client_id'],
            'client_secret' => $credentials['client_secret'],
            'code'          => $code,
            'grant_type'    => 'authorization_code',
            'redirect_uri'  => $credentials['redirect_uri'],
        ]);

        $accessToken = $tokenResponse['access_token'] ?? null;
        if (!is_string($accessToken)) {
            throw HttpException::badRequest('The provider rejected the authorization code.');
        }

        $profile = $this->httpGet(self::PROVIDERS[$provider]['userinfo'], $accessToken);

        if ($provider === 'google') {
            return [
                'id'     => (string) ($profile['sub'] ?? ''),
                'email'  => mb_strtolower((string) ($profile['email'] ?? '')),
                'name'   => (string) ($profile['name'] ?? 'Google user'),
                'avatar' => isset($profile['picture']) ? (string) $profile['picture'] : null,
            ];
        }

        $email = $profile['email'] ?? null;
        if (!is_string($email) || $email === '') {
            // GitHub hides addresses marked private on /user; ask the dedicated endpoint.
            $emails = $this->httpGet('https://api.github.com/user/emails', $accessToken);
            foreach (is_array($emails) ? $emails : [] as $candidate) {
                if (is_array($candidate) && ($candidate['primary'] ?? false) === true) {
                    $email = (string) $candidate['email'];
                    break;
                }
            }
        }

        return [
            'id'     => (string) ($profile['id'] ?? ''),
            'email'  => mb_strtolower(is_string($email) ? $email : ''),
            'name'   => (string) ($profile['name'] ?? $profile['login'] ?? 'GitHub user'),
            'avatar' => isset($profile['avatar_url']) ? (string) $profile['avatar_url'] : null,
        ];
    }

    /**
     * @param array{id: string, email: string, name: string, avatar: ?string} $profile
     *
     * @return array<string, mixed>
     */
    private function upsertUser(string $provider, array $profile): array
    {
        if ($profile['id'] === '' || $profile['email'] === '') {
            throw HttpException::badRequest('The provider did not share an email address.');
        }

        $pdo = Database::connection();

        $linked = $pdo->prepare(
            'SELECT u.* FROM oauth_identities oi
             JOIN users u ON u.id = oi.user_id
             WHERE oi.provider = ? AND oi.provider_user_id = ?'
        );
        $linked->execute([$provider, $profile['id']]);
        $user = $linked->fetch();

        if ($user !== false) {
            return $user;
        }

        $byEmail = $pdo->prepare('SELECT * FROM users WHERE email = ?');
        $byEmail->execute([$profile['email']]);
        $user = $byEmail->fetch();

        if ($user === false) {
            $pdo->prepare('INSERT INTO users (email, name, avatar_url) VALUES (?, ?, ?)')
                ->execute([$profile['email'], $profile['name'], $profile['avatar']]);
            $user = AuthController::findById((int) $pdo->lastInsertId());
        }

        $pdo->prepare('INSERT IGNORE INTO oauth_identities (user_id, provider, provider_user_id) VALUES (?, ?, ?)')
            ->execute([(int) $user['id'], $provider, $profile['id']]);

        return $user;
    }

    private function provider(Request $request): string
    {
        $provider = strtolower($request->params['provider'] ?? '');
        if (!array_key_exists($provider, self::PROVIDERS)) {
            throw HttpException::notFound('Unknown OAuth provider.');
        }

        return $provider;
    }

    /** @return array{client_id: string, client_secret: string, redirect_uri: string}|null */
    private static function credentials(string $provider): ?array
    {
        $prefix = strtoupper($provider);
        $clientId = Config::get($prefix . '_CLIENT_ID');
        $clientSecret = Config::get($prefix . '_CLIENT_SECRET');

        if ($clientId === null || $clientSecret === null) {
            return null;
        }

        return [
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri'  => Config::get(
                $prefix . '_REDIRECT_URI',
                'http://localhost:8080/api/auth/oauth/' . $provider . '/callback'
            ) ?? '',
        ];
    }

    private function frontendUrl(string $path): string
    {
        return rtrim(Config::get('APP_FRONTEND_URL', 'http://localhost:4200') ?? '', '/') . $path;
    }

    /**
     * @param array<string, string> $fields
     *
     * @return array<string, mixed>
     */
    private function httpPost(string $url, array $fields): array
    {
        return $this->send($url, [
            CURLOPT_POST       => true,
            CURLOPT_POSTFIELDS => http_build_query($fields),
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
        ]);
    }

    /** @return array<string, mixed> */
    private function httpGet(string $url, string $accessToken): array
    {
        return $this->send($url, [
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Authorization: Bearer ' . $accessToken,
                'User-Agent: presentation-maker',
            ],
        ]);
    }

    /**
     * @param array<int, mixed> $options
     *
     * @return array<string, mixed>
     */
    private function send(string $url, array $options): array
    {
        $handle = curl_init($url);
        if ($handle === false) {
            throw HttpException::badRequest('Could not reach the identity provider.');
        }

        curl_setopt_array($handle, $options + [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => ['Accept: application/json', 'User-Agent: presentation-maker'],
        ]);

        $body = curl_exec($handle);
        curl_close($handle);

        $decoded = is_string($body) ? json_decode($body, true) : null;
        if (!is_array($decoded)) {
            throw HttpException::badRequest('The identity provider returned an unexpected response.');
        }

        return $decoded;
    }
}
