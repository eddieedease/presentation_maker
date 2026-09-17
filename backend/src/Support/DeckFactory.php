<?php

declare(strict_types=1);

namespace App\Support;

final class DeckFactory
{
    /** @return array<string, mixed> */
    public static function starter(string $title): array
    {
        return DeckNormalizer::normalize([
            'theme'      => 'night',
            'transition' => 'slide',
            'slides'     => [
                [
                    'name'       => 'Title',
                    'background' => ['type' => 'gradient', 'value' => 'linear-gradient(135deg, #1e1b4b, #0f172a)'],
                    'notes'      => 'Welcome everyone and introduce the topic.',
                    'elements'   => [
                        [
                            'type'   => 'heading',
                            'text'   => $title,
                            'x'      => 120, 'y' => 250, 'width' => 1040, 'height' => 130,
                            'style'  => ['fontSize' => 76, 'fontWeight' => 700, 'align' => 'center', 'color' => '#ffffff'],
                        ],
                        [
                            'type'   => 'text',
                            'text'   => 'Built with Presentation Maker',
                            'x'      => 120, 'y' => 390, 'width' => 1040, 'height' => 60,
                            'style'  => ['fontSize' => 28, 'align' => 'center', 'color' => '#a5b4fc'],
                            'animation' => ['type' => 'fade-up', 'order' => 1],
                        ],
                    ],
                ],
                [
                    'name'     => 'Agenda',
                    'elements' => [
                        [
                            'type'  => 'heading',
                            'text'  => 'Agenda',
                            'x'     => 100, 'y' => 90, 'width' => 1080, 'height' => 90,
                            'style' => ['fontSize' => 56, 'fontWeight' => 700, 'color' => '#ffffff'],
                        ],
                        [
                            'type'  => 'list',
                            'text'  => "Where we are today\nWhat we are changing\nWhat happens next",
                            'x'     => 100, 'y' => 220, 'width' => 1080, 'height' => 360,
                            'style' => ['fontSize' => 34, 'lineHeight' => 1.8, 'color' => '#e2e8f0'],
                            'animation' => ['type' => 'fade-left', 'order' => 1],
                        ],
                    ],
                ],
            ],
        ]);
    }

    /** @return array<string, mixed> */
    public static function blankSlide(): array
    {
        return DeckNormalizer::normalize(['slides' => [[]]])['slides'][0];
    }
}
