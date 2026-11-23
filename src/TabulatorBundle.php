<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

namespace Derafu\TabulatorBundle;

use Symfony\Component\AssetMapper\AssetMapperInterface;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Loader\Configurator\ContainerConfigurator;
use Symfony\Component\HttpKernel\Bundle\AbstractBundle;

/**
 * Registers the request and response adapters for Tabulator collections.
 */
final class TabulatorBundle extends AbstractBundle
{
    protected string $extensionAlias = 'derafu_tabulator';

    public function prependExtension(ContainerConfigurator $configurator, ContainerBuilder $container): void
    {
        if (interface_exists(AssetMapperInterface::class)) {
            $container->prependExtensionConfig('framework', [
                'asset_mapper' => [
                    'paths' => [$this->getPath() . '/assets' => '@derafu/tabulator'],
                ],
            ]);
        }
    }

    /** @param array<string, mixed> $config */
    public function loadExtension(array $config, ContainerConfigurator $configurator, ContainerBuilder $container): void
    {
        $configurator->import('../resources/config/symfony-tabulator-bundle-services.yaml');
    }
}
