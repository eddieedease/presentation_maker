<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

/**
 * Sends transactional mail without any Composer dependency.
 *
 * Three transports, chosen by MAIL_TRANSPORT:
 *   smtp — talk SMTP directly, with STARTTLS or implicit TLS
 *   mail — hand off to PHP's mail(), which many shared hosts prefer because
 *          they block outbound SMTP ports
 *   log  — write the message to the PHP error log instead of sending it, so a
 *          developer can follow the verification link without a mail server
 */
final class Mailer
{
    public static function transport(): string
    {
        $transport = strtolower(Config::get('MAIL_TRANSPORT', 'log') ?? 'log');

        return in_array($transport, ['smtp', 'mail', 'log'], true) ? $transport : 'log';
    }

    public static function fromAddress(): string
    {
        return Config::get('MAIL_FROM_ADDRESS', 'no-reply@localhost') ?? 'no-reply@localhost';
    }

    public static function fromName(): string
    {
        return self::sanitizeHeader(Config::get('MAIL_FROM_NAME', 'Presentation Maker') ?? 'Presentation Maker');
    }

    /**
     * @throws RuntimeException when the message could not be handed off
     */
    public static function send(string $toAddress, string $toName, string $subject, string $html, string $text): void
    {
        $subject = self::sanitizeHeader($subject);
        $toName = self::sanitizeHeader($toName);

        if (filter_var($toAddress, FILTER_VALIDATE_EMAIL) === false) {
            throw new RuntimeException('Refusing to send to an invalid address.');
        }

        $boundary = 'pm-' . bin2hex(random_bytes(8));
        $body = self::body($boundary, $html, $text);

        match (self::transport()) {
            'smtp'  => self::sendSmtp($toAddress, $toName, $subject, $boundary, $body),
            'mail'  => self::sendMail($toAddress, $toName, $subject, $boundary, $body),
            default => self::sendLog($toAddress, $subject, $text),
        };
    }

    private static function body(string $boundary, string $html, string $text): string
    {
        return implode("\r\n", [
            '--' . $boundary,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: quoted-printable',
            '',
            quoted_printable_encode($text),
            '',
            '--' . $boundary,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: quoted-printable',
            '',
            quoted_printable_encode($html),
            '',
            '--' . $boundary . '--',
            '',
        ]);
    }

    /** @return list<string> */
    private static function headers(string $toAddress, string $toName, string $subject, string $boundary): array
    {
        return [
            'From: ' . self::formatAddress(self::fromAddress(), self::fromName()),
            'To: ' . self::formatAddress($toAddress, $toName),
            'Subject: ' . self::encodeHeader($subject),
            'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . self::hostname() . '>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
    }

    private static function sendLog(string $toAddress, string $subject, string $text): void
    {
        error_log(sprintf(
            "[presmaker mail] to=%s subject=%s\n%s\n[presmaker mail] end",
            $toAddress,
            $subject,
            $text
        ));
    }

    private static function sendMail(string $toAddress, string $toName, string $subject, string $boundary, string $body): void
    {
        $headers = self::headers($toAddress, $toName, $subject, $boundary);
        // mail() takes the recipient and subject as their own arguments.
        $headers = array_values(array_filter(
            $headers,
            static fn (string $header): bool => !str_starts_with($header, 'To: ') && !str_starts_with($header, 'Subject: ')
        ));

        $sent = mail($toAddress, self::encodeHeader($subject), $body, implode("\r\n", $headers));
        if ($sent === false) {
            throw new RuntimeException('PHP mail() refused the message. Check your hosting mail settings.');
        }
    }

    private static function sendSmtp(string $toAddress, string $toName, string $subject, string $boundary, string $body): void
    {
        $host = Config::get('MAIL_HOST', '');
        $port = Config::int('MAIL_PORT', 587);
        $encryption = strtolower(Config::get('MAIL_ENCRYPTION', 'tls') ?? 'tls');

        if ($host === null || $host === '') {
            throw new RuntimeException('No SMTP host is configured.');
        }

        $endpoint = ($encryption === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
        $socket = @stream_socket_client($endpoint, $errno, $errstr, 20, STREAM_CLIENT_CONNECT);

        if ($socket === false) {
            throw new RuntimeException(sprintf('Could not connect to %s (%s).', $endpoint, $errstr !== '' ? $errstr : 'no route'));
        }

        stream_set_timeout($socket, 20);

        try {
            self::expect($socket, 220);
            self::command($socket, 'EHLO ' . self::hostname(), 250);

            if ($encryption === 'tls') {
                self::command($socket, 'STARTTLS', 220);
                $crypto = stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                if ($crypto !== true) {
                    throw new RuntimeException('The server refused to start TLS.');
                }
                self::command($socket, 'EHLO ' . self::hostname(), 250);
            }

            $username = Config::get('MAIL_USERNAME');
            $password = Config::get('MAIL_PASSWORD');
            if ($username !== null && $password !== null) {
                self::command($socket, 'AUTH LOGIN', 334);
                self::command($socket, base64_encode($username), 334);
                self::command($socket, base64_encode($password), 235);
            }

            self::command($socket, 'MAIL FROM:<' . self::fromAddress() . '>', 250);
            self::command($socket, 'RCPT TO:<' . $toAddress . '>', 250);
            self::command($socket, 'DATA', 354);

            $message = implode("\r\n", self::headers($toAddress, $toName, $subject, $boundary)) . "\r\n\r\n" . $body;
            // A lone "." would end the message early.
            $message = preg_replace('/^\./m', '..', $message) ?? $message;

            self::write($socket, $message . "\r\n.");
            self::expect($socket, 250);
            self::write($socket, 'QUIT');
        } finally {
            @fclose($socket);
        }
    }

    /** @param resource $socket */
    private static function command($socket, string $command, int $expected): void
    {
        self::write($socket, $command);
        self::expect($socket, $expected);
    }

    /** @param resource $socket */
    private static function write($socket, string $line): void
    {
        if (fwrite($socket, $line . "\r\n") === false) {
            throw new RuntimeException('Lost the connection to the mail server.');
        }
    }

    /** @param resource $socket */
    private static function expect($socket, int $expected): void
    {
        $response = '';

        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            // A multi-line reply keeps a hyphen after the status code.
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }

        $code = (int) substr(trim($response), 0, 3);
        if ($code !== $expected) {
            throw new RuntimeException(sprintf('Mail server said: %s', trim($response) !== '' ? trim($response) : 'no reply'));
        }
    }

    private static function formatAddress(string $address, string $name): string
    {
        return $name === '' ? $address : sprintf('%s <%s>', self::encodeHeader($name), $address);
    }

    private static function encodeHeader(string $value): string
    {
        return preg_match('/[^\x20-\x7E]/', $value) === 1
            ? '=?UTF-8?B?' . base64_encode($value) . '?='
            : $value;
    }

    /** Strips CR/LF so a caller can never inject extra headers. */
    private static function sanitizeHeader(string $value): string
    {
        return trim(str_replace(["\r", "\n", "\0"], '', $value));
    }

    private static function hostname(): string
    {
        $host = parse_url(Config::get('APP_FRONTEND_URL', 'http://localhost') ?? '', PHP_URL_HOST);

        return is_string($host) && $host !== '' ? $host : 'localhost';
    }
}
