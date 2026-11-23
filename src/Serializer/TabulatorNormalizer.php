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

use ApiPlatform\State\Pagination\PaginatorInterface;
use Derafu\Translation\Exception\Logic\TranslatableInvalidArgumentException;
use Symfony\Component\Serializer\Normalizer\NormalizerAwareInterface;
use Symfony\Component\Serializer\Normalizer\NormalizerAwareTrait;
use Symfony\Component\Serializer\Normalizer\NormalizerInterface;

final class TabulatorNormalizer implements NormalizerInterface, NormalizerAwareInterface
{
    use NormalizerAwareTrait;

    public function normalize(mixed $object, ?string $format = null, array $context = []): array
    {
        if (!$object instanceof PaginatorInterface) {
            throw new TranslatableInvalidArgumentException([
                'The object to normalize must implement {interface}, {given} given.',
                'interface' => PaginatorInterface::class,
                'given' => get_debug_type($object),
            ]);
        }

        $items = [];
        foreach ($object as $item) {
            $items[] = $this->normalizer->normalize($item, 'json', $context);
        }

        return [
            'last_page' => (int) $object->getLastPage(),
            'data'      => $items,
        ];
    }

    public function supportsNormalization(mixed $data, ?string $format = null, array $context = []): bool
    {
        return $format === TabulatorEncoder::FORMAT
            && $data instanceof PaginatorInterface;
    }

    public function getSupportedTypes(?string $format): array
    {
        return [PaginatorInterface::class => true];
    }
}
