<?php

declare(strict_types=1);

namespace App\Support;

use Throwable;

final class Router
{
    /** @var list<array{method: string, pattern: string, handler: callable, protected: bool}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler, bool $protected = false): void
    {
        $this->add('GET', $pattern, $handler, $protected);
    }

    public function post(string $pattern, callable $handler, bool $protected = false): void
    {
        $this->add('POST', $pattern, $handler, $protected);
    }

    public function put(string $pattern, callable $handler, bool $protected = false): void
    {
        $this->add('PUT', $pattern, $handler, $protected);
    }

    public function delete(string $pattern, callable $handler, bool $protected = false): void
    {
        $this->add('DELETE', $pattern, $handler, $protected);
    }

    private function add(string $method, string $pattern, callable $handler, bool $protected): void
    {
        $this->routes[] = compact('method', 'pattern', 'handler', 'protected');
    }

    public function dispatch(Request $request): void
    {
        Response::applyCors();

        if ($request->method() === 'OPTIONS') {
            Response::noContent();

            return;
        }

        $path = $request->path();
        $pathMatched = false;

        foreach ($this->routes as $route) {
            $params = $this->match($route['pattern'], $path);
            if ($params === null) {
                continue;
            }

            $pathMatched = true;
            if ($route['method'] !== $request->method()) {
                continue;
            }

            $request->params = $params;

            try {
                if ($route['protected']) {
                    $this->authenticate($request);
                }

                ($route['handler'])($request);
            } catch (HttpException $e) {
                Response::error($e->status(), $e->getMessage(), $e->details());
            } catch (Throwable $e) {
                error_log('[presmaker] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
                Response::error(500, 'Unexpected server error.');
            }

            return;
        }

        $pathMatched
            ? Response::error(405, 'Method not allowed for this endpoint.')
            : Response::error(404, 'Endpoint not found.');
    }

    private function authenticate(Request $request): void
    {
        $token = $request->bearerToken();
        if ($token === null) {
            throw HttpException::unauthorized();
        }

        $claims = Jwt::decode($token);
        if (($claims['typ'] ?? null) !== 'access') {
            throw HttpException::unauthorized('An access token is required.');
        }

        $request->setUserId((int) ($claims['sub'] ?? 0));
    }

    /** @return array<string, string>|null */
    private function match(string $pattern, string $path): ?array
    {
        $regex = '#^' . preg_replace('#\{([a-zA-Z_]+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        if (preg_match($regex, $path, $matches) !== 1) {
            return null;
        }

        return array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
    }
}
