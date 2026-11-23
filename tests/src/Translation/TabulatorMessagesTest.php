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

use Derafu\Translation\SimpleTranslationResourceProvider;
use Derafu\Translation\TranslatorFactory;
use Derafu\Twig\Extension\TranslationExtension;
use Derafu\Twig\Lint\TwigTranslationAudit;
use PHPUnit\Framework\Attributes\CoversNothing;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Twig\Environment;
use Twig\Loader\FilesystemLoader;

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
        $provider = new SimpleTranslationResourceProvider([$root . '/translations']);
        $twig = new Environment(new FilesystemLoader([$root . '/templates']));
        $twig->addExtension(new TranslationExtension(TranslatorFactory::create($locale, [], [$provider])));

        $report = (new TwigTranslationAudit())->audit(
            $root . '/src',
            $root . '/templates',
            $provider,
            $twig,
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
        $this->assertSame([], $report->describe($report->untranslatedTexts));
    }
}
