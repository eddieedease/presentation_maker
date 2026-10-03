<?php

declare(strict_types=1);

// Serves the Angular app with a <base href> matching the directory it is
// installed in, worked out per request. The built index.html always says
// <base href="/">, so this keeps a subdirectory install (example.com/decks/)
// working without patching files on disk — and without breaking again when
// an upgrade uploads a fresh index.html.

$indexPath = __DIR__ . '/index.html';
if (!is_file($indexPath)) {
    http_response_code(404);
    exit;
}

$directory = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
$base = $directory === '/' || $directory === '.' ? '/' : rtrim($directory, '/') . '/';

$html = (string) file_get_contents($indexPath);
$html = preg_replace(
    '#<base href="[^"]*">#',
    '<base href="' . htmlspecialchars($base, ENT_QUOTES) . '">',
    $html,
    1,
) ?? $html;

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
echo $html;
