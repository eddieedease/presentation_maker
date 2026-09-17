<?php

/**
 * Presentation Maker — web installer.
 *
 * A single self-contained file for shared hosting: upload the release bundle,
 * open this page in a browser, and it checks requirements, creates the database
 * schema, writes the configuration and creates your admin account.
 *
 * It refuses to run once the app is configured, and offers to delete itself
 * when it is finished.
 */

declare(strict_types=1);

session_start();

const MIN_PHP_VERSION = '8.1.0';

// ---------------------------------------------------------------------------
// Locating the application
// ---------------------------------------------------------------------------

/** Finds the directory holding src/, for both the release and repo layouts. */
function appDirectory(): ?string
{
    $candidates = [
        __DIR__ . '/app',      // release bundle: install.php sits beside app/
        dirname(__DIR__),      // repository: backend/public/install.php
    ];

    foreach ($candidates as $candidate) {
        if (is_file($candidate . '/src/Support/Config.php')) {
            return $candidate;
        }
    }

    return null;
}

$appDir = appDirectory();
$configPath = $appDir === null ? null : $appDir . '/config.php';
$schemaPath = $appDir === null ? null : $appDir . '/database/schema.sql';

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function halt(string $title, string $message): never
{
    render($title, '<div class="alert">' . htmlspecialchars($message, ENT_QUOTES) . '</div>');
    exit;
}

if (getenv('APP_INSTALLER_DISABLED') === '1') {
    halt('Installer disabled', 'This deployment manages its own configuration, so the installer is switched off.');
}

if ($appDir === null) {
    halt(
        'Application files not found',
        'install.php could not find the application. It must sit next to the app/ directory from the release bundle.'
    );
}

if (is_file($configPath) && ($_GET['step'] ?? '') !== 'done') {
    halt(
        'Already installed',
        'A configuration file already exists. Delete install.php. To reinstall, remove app/config.php first — '
        . 'note that this does not delete any data.'
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function csrfToken(): string
{
    if (!isset($_SESSION['installer_csrf'])) {
        $_SESSION['installer_csrf'] = bin2hex(random_bytes(16));
    }

    return $_SESSION['installer_csrf'];
}

function checkCsrf(): void
{
    $sent = $_POST['_token'] ?? '';
    if (!is_string($sent) || !hash_equals(csrfToken(), $sent)) {
        halt('Session expired', 'Your installer session expired. Reload this page and start again.');
    }
}

function post(string $key, string $default = ''): string
{
    $value = $_POST[$key] ?? $default;

    return is_scalar($value) ? trim((string) $value) : $default;
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES);
}

/** Directory this installer is served from: '' at the web root, '/decks' in a subfolder. */
function baseDirectory(): string
{
    $directory = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));

    return $directory === '/' || $directory === '.' ? '' : rtrim($directory, '/');
}

/** Best guess at the public URL this install will be served from. */
function detectSiteUrl(): string
{
    $https = ($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off';
    $https = $https || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';

    return ($https ? 'https://' : 'http://') . $host . baseDirectory();
}

/** @return list<string> */
function splitSqlStatements(string $sql): array
{
    $withoutComments = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    $statements = array_map('trim', explode(';', $withoutComments));

    return array_values(array_filter($statements, static fn (string $s): bool => $s !== ''));
}

function connect(array $db, bool $withDatabase = true): PDO
{
    $dsn = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $db['host'], $db['port']);
    if ($withDatabase) {
        $dsn .= ';dbname=' . $db['name'];
    }

    return new PDO($dsn, $db['user'], $db['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

// ---------------------------------------------------------------------------
// Requirement checks
// ---------------------------------------------------------------------------

/** @return list<array{label: string, ok: bool, required: bool, detail: string}> */
function requirements(?string $appDir): array
{
    $configDirWritable = $appDir !== null && is_writable($appDir);
    $rewrite = function_exists('apache_get_modules') ? in_array('mod_rewrite', apache_get_modules(), true) : null;

    $checks = [
        [
            'label'    => 'PHP ' . MIN_PHP_VERSION . ' or newer',
            'ok'       => version_compare(PHP_VERSION, MIN_PHP_VERSION, '>='),
            'required' => true,
            'detail'   => 'Running PHP ' . PHP_VERSION,
        ],
        [
            'label'    => 'PDO with the MySQL driver',
            'ok'       => extension_loaded('pdo') && extension_loaded('pdo_mysql'),
            'required' => true,
            'detail'   => 'Needed to talk to your database',
        ],
        [
            'label'    => 'mbstring extension',
            'ok'       => extension_loaded('mbstring'),
            'required' => true,
            'detail'   => 'Needed for correct handling of slide text',
        ],
        [
            'label'    => 'JSON extension',
            'ok'       => extension_loaded('json'),
            'required' => true,
            'detail'   => 'Decks are stored as JSON',
        ],
        [
            'label'    => 'app/ directory is writable',
            'ok'       => $configDirWritable,
            'required' => true,
            'detail'   => $configDirWritable
                ? 'The installer can write config.php'
                : 'chmod the app/ directory to 755 (or 775) so config.php can be written',
        ],
        [
            'label'    => 'cURL extension',
            'ok'       => extension_loaded('curl'),
            'required' => false,
            'detail'   => 'Only needed for Google / GitHub sign-in',
        ],
    ];

    if ($rewrite !== null) {
        $checks[] = [
            'label'    => 'Apache mod_rewrite',
            'ok'       => $rewrite,
            'required' => true,
            'detail'   => 'Pretty URLs and the API both depend on it',
        ];
    }

    return $checks;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

$step = $_GET['step'] ?? 'requirements';
$errors = [];

// ---- Step 2: database ------------------------------------------------------

if ($step === 'database' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    checkCsrf();

    $db = [
        'host'     => post('db_host', 'localhost'),
        'port'     => post('db_port', '3306'),
        'name'     => post('db_name'),
        'user'     => post('db_user'),
        'password' => $_POST['db_password'] ?? '',
    ];

    if ($db['name'] === '' || $db['user'] === '') {
        $errors[] = 'Database name and username are required.';
    }

    if ($errors === []) {
        try {
            connect($db);
        } catch (PDOException $e) {
            // 1049 = unknown database. Most shared hosts make you create it in
            // the control panel first, but try on the off chance we may.
            if (str_contains($e->getMessage(), '1049') && post('create_database') === '1') {
                try {
                    $pdo = connect($db, withDatabase: false);
                    $pdo->exec(sprintf(
                        'CREATE DATABASE `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
                        str_replace('`', '', $db['name'])
                    ));
                } catch (PDOException $inner) {
                    $errors[] = 'Could not create the database: ' . $inner->getMessage();
                }
            } elseif (str_contains($e->getMessage(), '1049')) {
                $errors[] = 'That database does not exist. Create it in your hosting control panel, '
                    . 'or tick "create it for me" below if your user has permission.';
            } else {
                $errors[] = 'Could not connect: ' . $e->getMessage();
            }
        }
    }

    if ($errors === []) {
        $_SESSION['installer_db'] = $db;
        header('Location: ?step=site');
        exit;
    }
}

// ---- Step 3: site settings and admin account -------------------------------

if ($step === 'site' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    checkCsrf();

    $db = $_SESSION['installer_db'] ?? null;
    if (!is_array($db)) {
        header('Location: ?step=database');
        exit;
    }

    $siteUrl = rtrim(post('site_url', detectSiteUrl()), '/');
    $adminName = post('admin_name');
    $adminEmail = mb_strtolower(post('admin_email'));
    $adminPassword = (string) ($_POST['admin_password'] ?? '');

    if (filter_var($siteUrl, FILTER_VALIDATE_URL) === false) {
        $errors[] = 'The site URL does not look like a valid URL.';
    }
    if (mb_strlen($adminName) < 2) {
        $errors[] = 'Enter the administrator name.';
    }
    if (filter_var($adminEmail, FILTER_VALIDATE_EMAIL) === false) {
        $errors[] = 'Enter a valid administrator email address.';
    }
    if (mb_strlen($adminPassword) < 8) {
        $errors[] = 'The administrator password must be at least 8 characters.';
    }
    if ($adminPassword !== (string) ($_POST['admin_password_confirm'] ?? '')) {
        $errors[] = 'The two passwords do not match.';
    }

    if ($errors === []) {
        try {
            $pdo = connect($db);

            // 1. Schema
            $schema = is_string($schemaPath) && is_file($schemaPath) ? file_get_contents($schemaPath) : false;
            if ($schema === false) {
                throw new RuntimeException('Could not read app/database/schema.sql from the bundle.');
            }
            foreach (splitSqlStatements($schema) as $statement) {
                $pdo->exec($statement);
            }

            // 2. Admin account — created as part of the install so you can sign
            //    in the moment the installer finishes.
            $existing = $pdo->prepare('SELECT id FROM users WHERE email = ?');
            $existing->execute([$adminEmail]);
            $hash = password_hash($adminPassword, PASSWORD_DEFAULT);

            if ($existing->fetch() === false) {
                $pdo->prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
                    ->execute([$adminEmail, $adminName, $hash]);
            } else {
                $pdo->prepare('UPDATE users SET name = ?, password_hash = ? WHERE email = ?')
                    ->execute([$adminName, $hash, $adminEmail]);
            }

            // 3. Configuration file
            $settings = [
                'DB_HOST'              => $db['host'],
                'DB_PORT'              => $db['port'],
                'DB_NAME'              => $db['name'],
                'DB_USER'              => $db['user'],
                'DB_PASSWORD'          => $db['password'],
                'JWT_SECRET'           => bin2hex(random_bytes(32)),
                'JWT_ISSUER'           => 'presmaker-api',
                'ACCESS_TOKEN_TTL'     => '900',
                'REFRESH_TOKEN_TTL'    => '1209600',
                'APP_FRONTEND_URL'     => $siteUrl,
                'CORS_ALLOWED_ORIGINS' => $siteUrl,
                'GOOGLE_CLIENT_ID'     => post('google_client_id'),
                'GOOGLE_CLIENT_SECRET' => post('google_client_secret'),
                'GOOGLE_REDIRECT_URI'  => $siteUrl . '/api/auth/oauth/google/callback',
                'GITHUB_CLIENT_ID'     => post('github_client_id'),
                'GITHUB_CLIENT_SECRET' => post('github_client_secret'),
                'GITHUB_REDIRECT_URI'  => $siteUrl . '/api/auth/oauth/github/callback',
            ];

            $php = "<?php\n\n// Generated by the Presentation Maker installer on " . gmdate('Y-m-d H:i') . " UTC.\n"
                . "// Safe to edit by hand. Keep it out of public source control.\n\nreturn "
                . var_export($settings, true) . ";\n";

            if (file_put_contents($configPath, $php) === false) {
                throw new RuntimeException('Could not write ' . $configPath . '. Check the directory permissions.');
            }
            @chmod($configPath, 0640);

            // 4. Point the built frontend at this directory, so the same bundle
            //    works at the web root and in a subfolder.
            $indexPath = __DIR__ . '/index.html';
            $base = baseDirectory() . '/';
            if (is_file($indexPath) && is_writable($indexPath)) {
                $html = (string) file_get_contents($indexPath);
                $patched = preg_replace('#<base href="[^"]*">#', '<base href="' . e($base) . '">', $html, 1);
                if (is_string($patched)) {
                    file_put_contents($indexPath, $patched);
                }
            }

            $_SESSION['installer_site_url'] = $siteUrl;
            $_SESSION['installer_admin_email'] = $adminEmail;
            unset($_SESSION['installer_db']);

            header('Location: ?step=done');
            exit;
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }
    }
}

// ---- Step 4: finished ------------------------------------------------------

if ($step === 'done' && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'delete') {
    checkCsrf();
    $deleted = @unlink(__FILE__);
    $target = ($_SESSION['installer_site_url'] ?? '.') . '/';
    session_destroy();

    if ($deleted) {
        header('Location: ' . $target);
        exit;
    }

    $step = 'done';
    $errors[] = 'Could not delete install.php automatically. Please remove it over FTP.';
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(string $title, string $body, string $stepLabel = ''): void
{
    $steps = ['requirements' => 'Requirements', 'database' => 'Database', 'site' => 'Site &amp; admin', 'done' => 'Finish'];
    $current = $stepLabel;
    ?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $title ?> — Presentation Maker</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#070a16; color:#cbd5e1; font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 48px 20px 80px; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:32px; }
  .logo { width:32px; height:32px; border-radius:8px; background:#6366f1; color:#fff; display:grid; place-items:center; font-weight:700; }
  .brand span { color:#fff; font-weight:600; }
  .steps { display:flex; gap:6px; margin-bottom:28px; flex-wrap:wrap; }
  .steps div { flex:1 1 90px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; padding:7px 10px; border-radius:7px; background:#111834; color:#64748b; text-align:center; }
  .steps div.on { background:rgba(99,102,241,.2); color:#c7d2fe; }
  .card { background:#111834; border:1px solid rgba(255,255,255,.1); border-radius:14px; padding:26px; }
  h1 { color:#fff; font-size:22px; margin:0 0 8px; }
  h2 { color:#fff; font-size:15px; margin:26px 0 10px; }
  p.lead { color:#94a3b8; margin:0 0 22px; font-size:14px; }
  label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; margin:14px 0 5px; }
  input[type=text], input[type=password], input[type=email], input[type=url] {
    width:100%; padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,.12);
    background:#0b1020; color:#f1f5f9; font-size:14px; font-family:inherit;
  }
  input:focus { outline:none; border-color:#818cf8; }
  .row { display:flex; gap:12px; } .row > * { flex:1; }
  .btn { display:inline-block; margin-top:26px; padding:11px 20px; border-radius:9px; border:0; cursor:pointer;
         background:#6366f1; color:#fff; font:inherit; font-weight:600; font-size:14px; text-decoration:none; }
  .btn:hover { background:#818cf8; }
  .btn.sec { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); color:#e2e8f0; }
  .check { display:flex; gap:12px; padding:11px 0; border-bottom:1px solid rgba(255,255,255,.06); align-items:flex-start; }
  .check:last-child { border-bottom:0; }
  .mark { flex:none; width:20px; font-size:14px; }
  .ok { color:#34d399; } .bad { color:#fb7185; } .warn { color:#fbbf24; }
  .check b { color:#e2e8f0; font-weight:500; display:block; font-size:14px; }
  .check small { color:#64748b; font-size:12.5px; }
  .alert { background:rgba(244,63,94,.1); border:1px solid rgba(244,63,94,.3); color:#fecdd3;
           padding:12px 14px; border-radius:9px; margin-bottom:18px; font-size:14px; }
  .good { background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.3); color:#a7f3d0;
          padding:12px 14px; border-radius:9px; margin-bottom:18px; font-size:14px; }
  code { background:#0b1020; padding:2px 6px; border-radius:5px; font-size:13px; color:#c7d2fe; }
  .hint { color:#64748b; font-size:12.5px; margin-top:6px; }
  details { margin-top:22px; } summary { cursor:pointer; color:#a5b4fc; font-size:14px; }
  .cb { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:14px; color:#cbd5e1; }
  .cb input { accent-color:#6366f1; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><div class="logo">P</div><span>Presentation Maker</span></div>
    <?php if ($current !== ''): ?>
      <div class="steps">
        <?php foreach ($steps as $key => $name): ?>
          <div class="<?= $key === $current ? 'on' : '' ?>"><?= $name ?></div>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
    <div class="card"><?= $body ?></div>
  </div>
</body>
</html><?php
}

function errorBlock(array $errors): string
{
    if ($errors === []) {
        return '';
    }

    return '<div class="alert">' . implode('<br>', array_map(e(...), $errors)) . '</div>';
}

ob_start();
$token = csrfToken();

switch ($step) {
    case 'database':
        $checks = requirements($appDir);
        ?>
        <h1>Database connection</h1>
        <p class="lead">Use the MySQL database and user you created in your hosting control panel.</p>
        <?= errorBlock($errors) ?>
        <form method="post">
          <input type="hidden" name="_token" value="<?= e($token) ?>">
          <div class="row">
            <div><label for="db_host">Host</label><input id="db_host" type="text" name="db_host" value="<?= e(post('db_host', 'localhost')) ?>"></div>
            <div style="max-width:120px"><label for="db_port">Port</label><input id="db_port" type="text" name="db_port" value="<?= e(post('db_port', '3306')) ?>"></div>
          </div>
          <label for="db_name">Database name</label>
          <input id="db_name" type="text" name="db_name" value="<?= e(post('db_name')) ?>" placeholder="myaccount_presmaker">
          <label for="db_user">Username</label>
          <input id="db_user" type="text" name="db_user" value="<?= e(post('db_user')) ?>" placeholder="myaccount_presmaker">
          <label for="db_password">Password</label>
          <input id="db_password" type="password" name="db_password" value="<?= e((string) ($_POST['db_password'] ?? '')) ?>">
          <label class="cb"><input type="checkbox" name="create_database" value="1"> Create the database if it does not exist</label>
          <p class="hint">Most shared hosts do not allow this — create the database in cPanel/Plesk first.</p>
          <button class="btn" type="submit">Test connection and continue</button>
        </form>
        <?php
        break;

    case 'site':
        if (!isset($_SESSION['installer_db'])) {
            header('Location: ?step=database');
            exit;
        }
        ?>
        <h1>Site and administrator</h1>
        <p class="lead">Your admin account is created now, so you can sign in as soon as this finishes.</p>
        <?= errorBlock($errors) ?>
        <form method="post">
          <input type="hidden" name="_token" value="<?= e($token) ?>">
          <label for="site_url">Site URL</label>
          <input id="site_url" type="url" name="site_url" value="<?= e(post('site_url', detectSiteUrl())) ?>">
          <p class="hint">Detected automatically. Change it if you serve the site over a different hostname.</p>

          <h2>Administrator account</h2>
          <label for="admin_name">Name</label>
          <input id="admin_name" type="text" name="admin_name" value="<?= e(post('admin_name')) ?>" placeholder="Ada Lovelace">
          <label for="admin_email">Email</label>
          <input id="admin_email" type="email" name="admin_email" value="<?= e(post('admin_email')) ?>" placeholder="you@example.com">
          <div class="row">
            <div><label for="admin_password">Password</label><input id="admin_password" type="password" name="admin_password"></div>
            <div><label for="admin_password_confirm">Confirm</label><input id="admin_password_confirm" type="password" name="admin_password_confirm"></div>
          </div>
          <p class="hint">At least 8 characters.</p>

          <details>
            <summary>Optional: Google and GitHub sign-in</summary>
            <p class="hint" style="margin-top:10px">Leave blank to use email and password only. You can add these to app/config.php later.</p>
            <label for="google_client_id">Google client ID</label>
            <input id="google_client_id" type="text" name="google_client_id" value="<?= e(post('google_client_id')) ?>">
            <label for="google_client_secret">Google client secret</label>
            <input id="google_client_secret" type="password" name="google_client_secret" value="<?= e(post('google_client_secret')) ?>">
            <label for="github_client_id">GitHub client ID</label>
            <input id="github_client_id" type="text" name="github_client_id" value="<?= e(post('github_client_id')) ?>">
            <label for="github_client_secret">GitHub client secret</label>
            <input id="github_client_secret" type="password" name="github_client_secret" value="<?= e(post('github_client_secret')) ?>">
          </details>

          <button class="btn" type="submit">Install</button>
        </form>
        <?php
        break;

    case 'done':
        $siteUrl = (string) ($_SESSION['installer_site_url'] ?? '.');
        $adminEmail = (string) ($_SESSION['installer_admin_email'] ?? '');
        ?>
        <h1>Installation complete</h1>
        <div class="good">
          The database is ready, <code><?= e($adminEmail) ?></code> can sign in as administrator,
          and your settings were written to <code>app/config.php</code>.
        </div>
        <?= errorBlock($errors) ?>
        <p class="lead">
          One thing left: <strong>delete install.php</strong>. Leaving it on a live server lets anyone
          reconfigure your site.
        </p>
        <form method="post">
          <input type="hidden" name="_token" value="<?= e($token) ?>">
          <input type="hidden" name="action" value="delete">
          <button class="btn" type="submit">Delete the installer and open my site</button>
        </form>
        <p style="margin-top:18px"><a class="btn sec" href="<?= e($siteUrl) ?>/">Skip and open the site</a></p>
        <?php
        break;

    default:
        $checks = requirements($appDir);
        $blocked = array_filter($checks, static fn (array $c): bool => $c['required'] && !$c['ok']);
        ?>
        <h1>Welcome</h1>
        <p class="lead">This installer sets up Presentation Maker on your hosting in about a minute.
          First, a look at what your server provides.</p>
        <?php foreach ($checks as $check): ?>
          <div class="check">
            <div class="mark <?= $check['ok'] ? 'ok' : ($check['required'] ? 'bad' : 'warn') ?>">
              <?= $check['ok'] ? '&#10003;' : ($check['required'] ? '&#10007;' : '!') ?>
            </div>
            <div><b><?= $check['label'] ?><?= $check['required'] ? '' : ' (optional)' ?></b><small><?= e($check['detail']) ?></small></div>
          </div>
        <?php endforeach; ?>
        <?php if ($blocked !== []): ?>
          <div class="alert" style="margin-top:20px">
            Some requirements are not met. Fix them and reload this page — your host's support can usually
            enable a missing PHP extension for you.
          </div>
          <a class="btn sec" href="?step=requirements">Check again</a>
        <?php else: ?>
          <p class="lead" style="margin-top:22px">Everything checks out. Have your database name, username and
            password ready.</p>
          <a class="btn" href="?step=database">Get started</a>
        <?php endif; ?>
        <?php
}

$body = (string) ob_get_clean();
$labels = ['requirements' => 'requirements', 'database' => 'database', 'site' => 'site', 'done' => 'done'];
render(ucfirst($labels[$step] ?? 'Install'), $body, $labels[$step] ?? 'requirements');
