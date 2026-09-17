<?php

declare(strict_types=1);

use App\Controllers\AdminController;
use App\Controllers\AuthController;
use App\Controllers\ImageController;
use App\Controllers\OAuthController;
use App\Controllers\ProjectController;
use App\Controllers\PublicController;
use App\Support\Request;
use App\Support\Response;
use App\Support\Router;

// The application directory is app/ in a deployed bundle, and the parent of
// public/ in the repository checkout.
$appDir = is_dir(__DIR__ . '/app/src') ? __DIR__ . '/app' : dirname(__DIR__);

spl_autoload_register(static function (string $class) use ($appDir): void {
    if (!str_starts_with($class, 'App\\')) {
        return;
    }

    $path = $appDir . '/src/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

$router = new Router();
$auth = new AuthController();
$oauth = new OAuthController();
$projects = new ProjectController();
$public = new PublicController();
$images = new ImageController();
$admin = new AdminController();

$router->get('/api/health', static function (): void {
    Response::json(['status' => 'ok', 'time' => gmdate('c')]);
});

// --- Authentication -------------------------------------------------------
$router->post('/api/auth/register', $auth->register(...));
$router->post('/api/auth/login', $auth->login(...));
$router->post('/api/auth/refresh', $auth->refresh(...));
$router->post('/api/auth/logout', $auth->logout(...));
$router->post('/api/auth/verify', $auth->verify(...));
$router->post('/api/auth/verify/resend', $auth->resendVerification(...));
$router->get('/api/auth/me', $auth->me(...), protected: true);

// --- OAuth 2.0 ------------------------------------------------------------
$router->get('/api/auth/oauth/providers', $oauth->providers(...));
$router->get('/api/auth/oauth/{provider}/start', $oauth->start(...));
$router->get('/api/auth/oauth/{provider}/callback', $oauth->callback(...));

// --- Projects (all owner-scoped) -----------------------------------------
$router->get('/api/projects', $projects->index(...), protected: true);
$router->post('/api/projects', $projects->store(...), protected: true);
$router->get('/api/projects/{id}', $projects->show(...), protected: true);
$router->put('/api/projects/{id}', $projects->update(...), protected: true);
$router->delete('/api/projects/{id}', $projects->destroy(...), protected: true);
$router->post('/api/projects/{id}/duplicate', $projects->duplicate(...), protected: true);
$router->post('/api/projects/{id}/publish', $projects->publish(...), protected: true);
$router->delete('/api/projects/{id}/publish', $projects->unpublish(...), protected: true);

// --- Images ---------------------------------------------------------------
$router->get('/api/images', $images->index(...), protected: true);
$router->post('/api/images', $images->store(...), protected: true);
$router->delete('/api/images/{id}', $images->destroy(...), protected: true);
// Unauthenticated: published decks embed these URLs for viewers with no account.
$router->get('/api/images/{token}', $images->show(...));

// --- Administration (active admins only) ----------------------------------
$router->get('/api/admin/stats', $admin->stats(...), admin: true);
$router->get('/api/admin/users', $admin->index(...), admin: true);
$router->post('/api/admin/users', $admin->store(...), admin: true);
$router->put('/api/admin/users/{id}', $admin->update(...), admin: true);
$router->delete('/api/admin/users/{id}', $admin->destroy(...), admin: true);
$router->post('/api/admin/users/{id}/resend-verification', $admin->resendVerification(...), admin: true);

// --- Public player --------------------------------------------------------
$router->get('/api/public/presentations/{slug}', $public->show(...));

$router->dispatch(new Request());
