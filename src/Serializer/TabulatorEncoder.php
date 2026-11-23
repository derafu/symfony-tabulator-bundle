<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

namespace Derafu\TabulatorBundle\Serializer;

use Symfony\Component\Serializer\Encoder\DecoderInterface;
use Symfony\Component\Serializer\Encoder\EncoderInterface;

final class TabulatorEncoder implements EncoderInterface, DecoderInterface
{
    public const FORMAT = 'tabulator';

    public function encode(mixed $data, string $format, array $context = []): string
    {
        return json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }

    public function decode(string $data, string $format, array $context = []): mixed
    {
        return json_decode($data, true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @param array<string, mixed> $context
     */
    public function supportsEncoding(string $format, array $context = []): bool
    {
        return $format === self::FORMAT;
    }

    /**
     * @param array<string, mixed> $context
     */
    public function supportsDecoding(string $format, array $context = []): bool
    {
        return $format === self::FORMAT;
    }
}
