<?php

declare(strict_types=1);

namespace App\Support;

use GdImage;

/**
 * Accepts an uploaded image, re-encodes it and stores it outside the web root.
 *
 * Re-encoding is the point: the bytes that get stored are produced by GD from
 * the decoded pixels, so EXIF blobs, trailing archives and anything else
 * smuggled inside the original file do not survive. Files live outside the
 * document root and are streamed by ImageController, so even a file that
 * somehow contained PHP could never be executed.
 */
final class ImageService
{
    private const ALLOWED = [
        IMAGETYPE_JPEG => ['jpg', 'image/jpeg'],
        IMAGETYPE_PNG  => ['png', 'image/png'],
        IMAGETYPE_GIF  => ['gif', 'image/gif'],
        IMAGETYPE_WEBP => ['webp', 'image/webp'],
    ];

    public static function storageDirectory(): string
    {
        $configured = Config::get('STORAGE_PATH');
        if ($configured !== null) {
            return rtrim($configured, '/');
        }

        // src/Support/ImageService.php -> the application root next to src/
        return dirname(__DIR__, 2) . '/storage/uploads';
    }

    public static function maxBytes(): int
    {
        return Config::int('IMAGE_MAX_BYTES', 8 * 1024 * 1024);
    }

    public static function maxDimension(): int
    {
        return Config::int('IMAGE_MAX_DIMENSION', 1920);
    }

    public static function ensureSupported(): void
    {
        if (!extension_loaded('gd')) {
            throw new HttpException(500, 'Image uploads need the GD extension, which is not installed on this server.');
        }
    }

    /**
     * @param array<string, mixed> $file one entry of $_FILES
     *
     * @return array<string, mixed> the stored image row
     */
    public static function store(int $userId, array $file): array
    {
        self::ensureSupported();

        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            throw HttpException::badRequest(self::uploadErrorMessage($error));
        }

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw HttpException::badRequest('No file was received.');
        }

        if (filesize($tmpPath) > self::maxBytes()) {
            throw HttpException::badRequest(sprintf(
                'That image is larger than the %s limit.',
                self::formatBytes(self::maxBytes())
            ));
        }

        // Trust the bytes, never the client-supplied name or content type.
        $info = @getimagesize($tmpPath);
        if ($info === false || !array_key_exists($info[2], self::ALLOWED)) {
            throw HttpException::badRequest('That file is not a JPEG, PNG, GIF or WebP image.');
        }

        [$extension, $mime] = self::ALLOWED[$info[2]];
        // resize() takes ownership of the decoded handle: it either returns it
        // unchanged or frees it after drawing into the scaled copy.
        $resized = self::resize(self::decode($tmpPath, $info[2]), $info[0], $info[1]);

        $directory = self::storageDirectory();
        if (!is_dir($directory) && !@mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new HttpException(500, 'The upload directory does not exist and could not be created.');
        }

        $token = bin2hex(random_bytes(16));
        $path = $directory . '/' . $token . '.' . $extension;

        $written = match ($info[2]) {
            IMAGETYPE_JPEG => imagejpeg($resized, $path, 82),
            IMAGETYPE_PNG  => imagepng($resized, $path, 6),
            IMAGETYPE_GIF  => imagegif($resized, $path),
            IMAGETYPE_WEBP => imagewebp($resized, $path, 82),
            default        => false,
        };

        $width = imagesx($resized);
        $height = imagesy($resized);
        imagedestroy($resized);

        if ($written === false) {
            throw new HttpException(500, 'The image could not be written to storage.');
        }

        @chmod($path, 0644);

        $pdo = Database::connection();
        $pdo->prepare(
            'INSERT INTO images (user_id, token, original_name, mime, extension, width, height, bytes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $userId,
            $token,
            mb_substr((string) ($file['name'] ?? 'image'), 0, 255),
            $mime,
            $extension,
            $width,
            $height,
            (int) filesize($path),
        ]);

        return self::findById((int) $pdo->lastInsertId());
    }

    private static function decode(string $path, int $type): GdImage
    {
        $image = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG  => @imagecreatefrompng($path),
            IMAGETYPE_GIF  => @imagecreatefromgif($path),
            IMAGETYPE_WEBP => @imagecreatefromwebp($path),
            default        => false,
        };

        if (!$image instanceof GdImage) {
            throw HttpException::badRequest('That image could not be read. It may be corrupt.');
        }

        return $image;
    }

    /** Scales down to fit the long-edge limit. Smaller images are left alone. */
    private static function resize(GdImage $source, int $width, int $height): GdImage
    {
        $max = self::maxDimension();
        if ($width <= $max && $height <= $max) {
            return $source;
        }

        $scale = min($max / $width, $max / $height);
        $targetWidth = max(1, (int) round($width * $scale));
        $targetHeight = max(1, (int) round($height * $scale));

        $target = imagecreatetruecolor($targetWidth, $targetHeight);

        // Keep transparency instead of filling it with black.
        imagealphablending($target, false);
        imagesavealpha($target, true);
        $transparent = imagecolorallocatealpha($target, 0, 0, 0, 127);
        imagefilledrectangle($target, 0, 0, $targetWidth, $targetHeight, $transparent);

        imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);
        imagedestroy($source);

        return $target;
    }

    /** @return array<string, mixed> */
    public static function findById(int $id): array
    {
        $statement = Database::connection()->prepare('SELECT * FROM images WHERE id = ?');
        $statement->execute([$id]);
        $image = $statement->fetch();

        if ($image === false) {
            throw HttpException::notFound('That image does not exist.');
        }

        return $image;
    }

    /** @param array<string, mixed> $image */
    public static function pathFor(array $image): string
    {
        return self::storageDirectory() . '/' . $image['token'] . '.' . $image['extension'];
    }

    /**
     * @param array<string, mixed> $image
     *
     * @return array<string, mixed>
     */
    public static function present(array $image): array
    {
        return [
            'id'           => (int) $image['id'],
            'token'        => $image['token'],
            // Relative on purpose: it resolves against the app's <base href>,
            // so the same deck works at the web root and in a subdirectory.
            'url'          => 'api/images/' . $image['token'],
            'originalName' => $image['original_name'],
            'mime'         => $image['mime'],
            'width'        => (int) $image['width'],
            'height'       => (int) $image['height'],
            'bytes'        => (int) $image['bytes'],
            'createdAt'    => $image['created_at'],
        ];
    }

    public static function delete(int $id, int $userId): void
    {
        $image = self::findById($id);
        if ((int) $image['user_id'] !== $userId) {
            throw HttpException::forbidden('That image belongs to someone else.');
        }

        @unlink(self::pathFor($image));
        Database::connection()->prepare('DELETE FROM images WHERE id = ?')->execute([$id]);
    }

    private static function uploadErrorMessage(int $error): string
    {
        return match ($error) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'That image is larger than the server allows.',
            UPLOAD_ERR_PARTIAL                        => 'The upload was interrupted. Please try again.',
            UPLOAD_ERR_NO_FILE                        => 'No file was selected.',
            UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE => 'The server has nowhere to put the upload.',
            default                                   => 'The upload failed.',
        };
    }

    public static function formatBytes(int $bytes): string
    {
        return $bytes >= 1048576
            ? round($bytes / 1048576, 1) . ' MB'
            : round($bytes / 1024) . ' KB';
    }
}
