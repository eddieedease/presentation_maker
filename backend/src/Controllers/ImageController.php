<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\HttpException;
use App\Support\ImageService;
use App\Support\Request;
use App\Support\Response;

final class ImageController
{
    public function index(Request $request): void
    {
        $statement = Database::connection()->prepare(
            'SELECT * FROM images WHERE user_id = ? ORDER BY created_at DESC LIMIT 200'
        );
        $statement->execute([$request->userId()]);

        Response::json([
            'images' => array_map(ImageService::present(...), $statement->fetchAll()),
            'limits' => [
                'maxBytes'     => ImageService::maxBytes(),
                'maxDimension' => ImageService::maxDimension(),
            ],
        ]);
    }

    public function store(Request $request): void
    {
        $file = $_FILES['file'] ?? null;
        if (!is_array($file)) {
            throw HttpException::badRequest('Send the image as a multipart field named "file".');
        }

        Response::json(['image' => ImageService::present(ImageService::store($request->userId(), $file))], 201);
    }

    public function destroy(Request $request): void
    {
        ImageService::delete((int) ($request->params['id'] ?? 0), $request->userId());
        Response::noContent();
    }

    /**
     * Streams an image to anyone holding its token.
     *
     * Deliberately unauthenticated: published decks embed these URLs and must
     * render for viewers who have no account. The token is 16 random bytes, so
     * images cannot be enumerated the way sequential ids could.
     */
    public function show(Request $request): void
    {
        $token = preg_replace('/[^a-f0-9]/i', '', $request->params['token'] ?? '') ?? '';
        if (strlen($token) !== 32) {
            throw HttpException::notFound('That image link is not valid.');
        }

        $statement = Database::connection()->prepare('SELECT * FROM images WHERE token = ?');
        $statement->execute([$token]);
        $image = $statement->fetch();

        if ($image === false) {
            throw HttpException::notFound('That image no longer exists.');
        }

        $path = ImageService::pathFor($image);
        if (!is_file($path)) {
            throw HttpException::notFound('That image is missing from storage.');
        }

        $etag = '"' . $image['token'] . '"';
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
            http_response_code(304);

            return;
        }

        // The bytes for a token never change, so this can be cached hard.
        header('Content-Type: ' . $image['mime']);
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: public, max-age=31536000, immutable');
        header('ETag: ' . $etag);
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline; filename="' . preg_replace('/[^\w.-]/', '_', (string) $image['original_name']) . '"');

        readfile($path);
    }
}
