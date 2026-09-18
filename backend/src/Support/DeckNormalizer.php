<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Validates and normalises the deck document sent by the editor.
 *
 * Everything stored is whitelisted here, so the public player never has to
 * trust arbitrary client input.
 */
final class DeckNormalizer
{
    public const CANVAS_WIDTH = 1280;
    public const CANVAS_HEIGHT = 720;

    private const THEMES = [
        'black', 'white', 'league', 'beige', 'night', 'serif',
        'simple', 'solarized', 'moon', 'dracula', 'sky', 'blood',
    ];

    private const TRANSITIONS = ['none', 'fade', 'slide', 'convex', 'concave', 'zoom'];
    private const TRANSITION_SPEEDS = ['default', 'fast', 'slow'];
    private const ELEMENT_TYPES = [
        'heading', 'text', 'list', 'quote', 'image', 'video',
        'table', 'chart', 'icon', 'code', 'math', 'shape',
    ];
    private const ALIGNMENTS = ['left', 'center', 'right'];
    private const VERTICAL_ALIGNMENTS = ['start', 'center', 'end'];
    private const SHAPES = ['rectangle', 'ellipse', 'line', 'arrow'];
    private const CHART_KINDS = ['bar', 'column', 'line', 'pie'];
    private const VIDEO_PROVIDERS = ['youtube', 'vimeo', ''];

    private const MAX_TABLE_ROWS = 40;
    private const MAX_TABLE_COLUMNS = 12;
    private const MAX_CHART_POINTS = 24;
    private const ANIMATIONS = ['none', 'fade-in', 'fade-up', 'fade-left', 'fade-right', 'zoom-in', 'highlight'];
    private const BACKGROUND_TYPES = ['color', 'gradient', 'image'];

    /**
     * @param mixed $input
     *
     * @return array<string, mixed>
     */
    public static function normalize(mixed $input): array
    {
        $deck = is_array($input) ? $input : [];
        $slides = is_array($deck['slides'] ?? null) ? array_values($deck['slides']) : [];

        $normalized = [
            'version'         => 1,
            'theme'           => self::pick($deck['theme'] ?? null, self::THEMES, 'night'),
            'transition'      => self::pick($deck['transition'] ?? null, self::TRANSITIONS, 'slide'),
            'transitionSpeed' => self::pick($deck['transitionSpeed'] ?? null, self::TRANSITION_SPEEDS, 'default'),
            'controls'        => self::bool($deck['controls'] ?? true, true),
            'progress'        => self::bool($deck['progress'] ?? true, true),
            'slideNumber'     => self::bool($deck['slideNumber'] ?? false, false),
            'loop'            => self::bool($deck['loop'] ?? false, false),
            'slides'          => array_map(self::normalizeSlide(...), $slides),
        ];

        if ($normalized['slides'] === []) {
            $normalized['slides'] = [self::normalizeSlide([])];
        }

        return $normalized;
    }

    /**
     * @param mixed $input
     *
     * @return array<string, mixed>
     */
    private static function normalizeSlide(mixed $input): array
    {
        $slide = is_array($input) ? $input : [];
        $elements = is_array($slide['elements'] ?? null) ? array_values($slide['elements']) : [];

        return [
            'id'         => self::id($slide['id'] ?? null, 'slide'),
            'name'       => self::text($slide['name'] ?? '', 120),
            'notes'      => self::text($slide['notes'] ?? '', 4000),
            'transition' => self::pick($slide['transition'] ?? null, [...self::TRANSITIONS, ''], ''),
            'background' => self::normalizeBackground($slide['background'] ?? null),
            'elements'   => array_map(self::normalizeElement(...), array_slice($elements, 0, 60)),
        ];
    }

    /**
     * @param mixed $input
     *
     * @return array<string, mixed>
     */
    private static function normalizeBackground(mixed $input): array
    {
        $background = is_array($input) ? $input : [];
        $type = self::pick($background['type'] ?? null, self::BACKGROUND_TYPES, 'color');
        $value = self::text($background['value'] ?? '', 500);

        if ($type === 'image' && !self::isSafeUrl($value)) {
            $type = 'color';
            $value = '';
        }

        return ['type' => $type, 'value' => $value];
    }

    /**
     * @param mixed $input
     *
     * @return array<string, mixed>
     */
    private static function normalizeElement(mixed $input): array
    {
        $element = is_array($input) ? $input : [];
        $type = self::pick($element['type'] ?? null, self::ELEMENT_TYPES, 'text');
        $style = is_array($element['style'] ?? null) ? $element['style'] : [];
        $animation = is_array($element['animation'] ?? null) ? $element['animation'] : [];

        $src = self::text($element['src'] ?? '', 2000);
        if ($type === 'image' && !self::isSafeUrl($src)) {
            $src = '';
        }

        return [
            'id'       => self::id($element['id'] ?? null, 'el'),
            'type'     => $type,
            'x'        => self::number($element['x'] ?? 0, -2000, 4000, 0),
            'y'        => self::number($element['y'] ?? 0, -2000, 4000, 0),
            'width'    => self::number($element['width'] ?? 400, 8, 4000, 400),
            'height'   => self::number($element['height'] ?? 120, 8, 4000, 120),
            'rotation' => self::number($element['rotation'] ?? 0, -360, 360, 0),
            'zIndex'   => (int) self::number($element['zIndex'] ?? 1, 0, 999, 1),
            'locked'   => self::bool($element['locked'] ?? false, false),
            'text'     => self::text($element['text'] ?? '', 6000),
            'src'      => $src,
            'alt'      => self::text($element['alt'] ?? '', 300),
            'language' => preg_replace('/[^a-z0-9+#-]/i', '', self::text($element['language'] ?? 'javascript', 30)) ?: 'plaintext',
            'shape'    => self::pick($element['shape'] ?? null, self::SHAPES, 'rectangle'),
            'icon'      => self::iconName($element['icon'] ?? ''),
            'videoProvider' => self::pick($element['videoProvider'] ?? null, self::VIDEO_PROVIDERS, ''),
            'videoId'   => self::videoId(
                self::pick($element['videoProvider'] ?? null, self::VIDEO_PROVIDERS, ''),
                self::text($element['videoId'] ?? '', 32)
            ),
            'table'     => self::normalizeTable($element['table'] ?? null),
            'chart'     => self::normalizeChart($element['chart'] ?? null),
            'style'    => [
                'fontSize'        => self::number($style['fontSize'] ?? 32, 8, 400, 32),
                'fontFamily'      => self::text($style['fontFamily'] ?? '', 120),
                'fontWeight'      => (int) self::number($style['fontWeight'] ?? 400, 100, 900, 400),
                'italic'          => self::bool($style['italic'] ?? false, false),
                'underline'       => self::bool($style['underline'] ?? false, false),
                'color'           => self::color($style['color'] ?? '', ''),
                'background'      => self::color($style['background'] ?? 'transparent', 'transparent'),
                'borderColor'     => self::color($style['borderColor'] ?? 'transparent', 'transparent'),
                'borderWidth'     => self::number($style['borderWidth'] ?? 0, 0, 40, 0),
                'borderRadius'    => self::number($style['borderRadius'] ?? 0, 0, 999, 0),
                'padding'         => self::number($style['padding'] ?? 0, 0, 200, 0),
                'opacity'         => self::number($style['opacity'] ?? 1, 0, 1, 1),
                'lineHeight'      => self::number($style['lineHeight'] ?? 1.3, 0.6, 4, 1.3),
                'letterSpacing'   => self::number($style['letterSpacing'] ?? 0, -10, 40, 0),
                'align'           => self::pick($style['align'] ?? null, self::ALIGNMENTS, 'left'),
                'verticalAlign'   => self::pick($style['verticalAlign'] ?? null, self::VERTICAL_ALIGNMENTS, 'start'),
                'objectFit'       => self::pick($style['objectFit'] ?? null, ['cover', 'contain', 'fill'], 'cover'),
            ],
            'animation' => [
                'type'  => self::pick($animation['type'] ?? null, self::ANIMATIONS, 'none'),
                'order' => (int) self::number($animation['order'] ?? 0, 0, 60, 0),
            ],
        ];
    }

    /**
     * @param mixed $input
     *
     * @return array<string, mixed>
     */
    private static function normalizeTable(mixed $input): array
    {
        $table = is_array($input) ? $input : [];
        $rows = is_array($table['rows'] ?? null) ? array_values($table['rows']) : [];

        $normalized = [];
        foreach (array_slice($rows, 0, self::MAX_TABLE_ROWS) as $row) {
            $cells = is_array($row) ? array_values($row) : [];
            $normalized[] = array_map(
                static fn (mixed $cell): string => self::text($cell, 300),
                array_slice($cells, 0, self::MAX_TABLE_COLUMNS)
            );
        }

        if ($normalized === []) {
            $normalized = [['', '']];
        }

        // Every row must be the same width, or the rendered table goes ragged.
        $width = max(array_map('count', $normalized));
        foreach ($normalized as $index => $row) {
            $normalized[$index] = array_pad($row, $width, '');
        }

        return [
            'headerRow' => self::bool($table['headerRow'] ?? true, true),
            'rows'      => $normalized,
        ];
    }

    /**
     * @param mixed $input
     *
     * @return array<string, mixed>
     */
    private static function normalizeChart(mixed $input): array
    {
        $chart = is_array($input) ? $input : [];
        $points = is_array($chart['points'] ?? null) ? array_values($chart['points']) : [];

        $normalized = [];
        foreach (array_slice($points, 0, self::MAX_CHART_POINTS) as $point) {
            if (!is_array($point)) {
                continue;
            }

            $normalized[] = [
                'label' => self::text($point['label'] ?? '', 60),
                'value' => self::number($point['value'] ?? 0, -1000000000, 1000000000, 0),
            ];
        }

        return [
            'kind'       => self::pick($chart['kind'] ?? null, self::CHART_KINDS, 'bar'),
            'points'     => $normalized,
            'showValues' => self::bool($chart['showValues'] ?? true, true),
            'showAxis'   => self::bool($chart['showAxis'] ?? true, true),
        ];
    }

    /** Icon names index a fixed client-side set, so only the shape of the key matters. */
    private static function iconName(mixed $value): string
    {
        $name = strtolower(self::text($value, 40));

        return preg_match('/^[a-z0-9-]{1,40}$/', $name) === 1 ? $name : 'star';
    }

    /**
     * Video is embed-only. Ids are checked against each provider's own shape so
     * a deck cannot smuggle a path or a query string into the embed URL.
     */
    private static function videoId(string $provider, string $value): string
    {
        return match ($provider) {
            'youtube' => preg_match('/^[A-Za-z0-9_-]{5,20}$/', $value) === 1 ? $value : '',
            'vimeo'   => preg_match('/^[0-9]{5,15}$/', $value) === 1 ? $value : '',
            default   => '',
        };
    }

    /** @param list<string> $allowed */
    private static function pick(mixed $value, array $allowed, string $fallback): string
    {
        $value = is_string($value) ? strtolower(trim($value)) : '';

        return in_array($value, $allowed, true) ? $value : $fallback;
    }

    private static function text(mixed $value, int $max): string
    {
        $value = is_scalar($value) ? (string) $value : '';

        return mb_substr(trim($value), 0, $max);
    }

    private static function number(mixed $value, float $min, float $max, float $fallback): float
    {
        if (!is_numeric($value)) {
            return $fallback;
        }

        return round(max($min, min($max, (float) $value)), 3);
    }

    private static function bool(mixed $value, bool $fallback): bool
    {
        return is_bool($value) ? $value : $fallback;
    }

    private static function color(mixed $value, string $fallback): string
    {
        $value = is_string($value) ? trim($value) : '';

        // Empty is meaningful: it means "inherit from the deck theme".
        if ($value === '') {
            return '';
        }

        $isValid = $value === 'transparent'
            || preg_match('/^#[0-9a-f]{3,8}$/i', $value) === 1
            || preg_match('/^rgba?\(\s*[\d.\s,%]+\)$/i', $value) === 1
            || preg_match('/^linear-gradient\([\w\s.,%#()-]+\)$/i', $value) === 1;

        return $isValid ? $value : $fallback;
    }

    private static function isSafeUrl(string $value): bool
    {
        if ($value === '') {
            return false;
        }

        // Only http(s), inline images and our own uploads are allowed, which
        // rules out javascript: URLs. The upload form is relative on purpose so
        // it resolves against the app's <base href> in a subdirectory install.
        return preg_match('#^https?://#i', $value) === 1
            || preg_match('#^api/images/[a-f0-9]{32}$#i', $value) === 1
            || preg_match('#^data:image/(png|jpe?g|gif|webp);base64,#i', $value) === 1;
    }

    private static function id(mixed $value, string $prefix): string
    {
        $value = is_string($value) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $value) : '';

        return $value !== '' ? mb_substr($value, 0, 40) : $prefix . '_' . bin2hex(random_bytes(6));
    }
}
