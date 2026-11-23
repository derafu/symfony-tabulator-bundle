<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

namespace Derafu\TestsTabulatorBundle\Unit;

use ApiPlatform\State\Pagination\TraversablePaginator;
use ArrayIterator;
use Derafu\TabulatorBundle\Serializer\TabulatorEncoder;
use Derafu\TabulatorBundle\Serializer\TabulatorNormalizer;
use Derafu\Translation\Exception\Logic\TranslatableInvalidArgumentException;
use JsonException;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Serializer\Normalizer\NormalizerInterface;
use Symfony\Component\Serializer\Serializer;

#[CoversClass(TabulatorEncoder::class)]
#[CoversClass(TabulatorNormalizer::class)]
final class TabulatorSerializationTest extends TestCase
{
    public function testEncoderSupportsTheTabulatorFormatAndRoundTripsUnicode(): void
    {
        $encoder = new TabulatorEncoder();
        self::assertTrue($encoder->supportsEncoding('tabulator'));
        self::assertTrue($encoder->supportsDecoding('tabulator'));
        self::assertFalse($encoder->supportsEncoding('json'));
        self::assertFalse($encoder->supportsDecoding('json'));

        $payload = ['last_page' => 1, 'data' => [['name' => 'Lápiz']]];
        $json = $encoder->encode($payload, 'tabulator');
        self::assertSame('{"last_page":1,"data":[{"name":"Lápiz"}]}', $json);
        self::assertSame($payload, $encoder->decode($json, 'tabulator'));
    }

    public function testEncoderRejectsValuesThatCannotBeEncodedAsJson(): void
    {
        $this->expectException(JsonException::class);
        (new TabulatorEncoder())->encode(INF, 'tabulator');
    }

    public function testDecoderRejectsMalformedJson(): void
    {
        $this->expectException(JsonException::class);
        (new TabulatorEncoder())->decode('{', 'tabulator');
    }

    public function testNormalizerSupportsPaginatedCollectionsInTabulatorFormat(): void
    {
        $normalizer = new TabulatorNormalizer();
        $paginator = new TraversablePaginator(new ArrayIterator([]), 1, 10, 0);

        self::assertTrue($normalizer->supportsNormalization($paginator, 'tabulator'));
        self::assertFalse($normalizer->supportsNormalization($paginator, 'json'));
        self::assertFalse($normalizer->supportsNormalization([], 'tabulator'));
    }

    public function testNormalizerDelegatesRowSerializationInJsonWithTheOriginalContext(): void
    {
        $row = (object) ['name' => 'Lápiz'];
        $rowNormalizer = $this->createMock(NormalizerInterface::class);
        $rowNormalizer->expects(self::once())->method('normalize')
            ->with($row, 'json', ['groups' => ['product:read']])
            ->willReturn(['name' => 'Lápiz']);
        $normalizer = new TabulatorNormalizer();
        $normalizer->setNormalizer($rowNormalizer);

        $paginator = new TraversablePaginator(new ArrayIterator([$row]), 2, 10, 25);
        self::assertSame(
            ['last_page' => 3, 'data' => [['name' => 'Lápiz']]],
            $normalizer->normalize($paginator, 'tabulator', ['groups' => ['product:read']]),
        );
    }

    public function testEmptyPaginatorSerializesToAnEmptyDataArray(): void
    {
        $serializer = new Serializer([new TabulatorNormalizer()], [new TabulatorEncoder()]);
        $paginator = new TraversablePaginator(new ArrayIterator([]), 1, 10, 0);

        self::assertSame('{"last_page":1,"data":[]}', $serializer->serialize($paginator, 'tabulator'));
    }

    public function testDirectNormalizationRejectsValuesThatAreNotPaginators(): void
    {
        $this->expectException(TranslatableInvalidArgumentException::class);
        (new TabulatorNormalizer())->normalize([], 'tabulator');
    }
}
