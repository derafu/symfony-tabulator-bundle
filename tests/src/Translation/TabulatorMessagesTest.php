<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

namespace Derafu\TestsTabulatorBundle\Translation;

use Derafu\Translation\Lint\TranslationAudit;
use Derafu\Translation\SimpleTranslationResourceProvider;
use PHPUnit\Framework\Attributes\CoversNothing;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

#[CoversNothing]
final class TabulatorMessagesTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function localeProvider(): array
    {
        return [
            'es' => ['es'],
            'ht' => ['ht'],
            'zh_Hans' => ['zh_Hans'],
        ];
    }

    #[DataProvider('localeProvider')]
    public function testTheBundleIsTranslated(string $locale): void
    {
        $root = dirname(__DIR__, 3);
        $report = (new TranslationAudit())->audit(
            $root . '/src',
            new SimpleTranslationResourceProvider([$root . '/translations']),
            $locale,
            allowedThrowables: [
                // Symfony uses this exception to preserve the HTTP 400 status.
                BadRequestHttpException::class,
            ],
        );

        $this->assertFalse($report->nothingFound);
        $this->assertSame([], $report->describe($report->dynamicMessages));
        $this->assertSame([], $report->describe($report->missingTranslations));
        $this->assertSame([], $report->describe($report->notUsedBySources));
        $this->assertSame([], $report->describe($report->notTranslatable));
    }
}
