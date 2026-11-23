<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

use Derafu\TestsTabulatorBundle\Fixture\Kernel;
use Symfony\Component\AssetMapper\AssetMapperInterface;
use Symfony\Component\AssetMapper\ImportMap\ImportMapRenderer;
use Symfony\Component\Filesystem\Filesystem;
use Twig\Environment;

require dirname(__DIR__, 2) . '/vendor/autoload.php';

$projectDirectory = sys_get_temp_dir() . '/derafu-tabulator-browser-' . bin2hex(random_bytes(8));
$kernel = new Kernel($projectDirectory, withTwig: true);
$filesystem = new Filesystem();

try {
    $filesystem->dumpFile($projectDirectory . '/importmap.php', <<<'CONFIG'
        <?php

        return [
            '@derafu/tabulator/table' => ['path' => '@derafu/tabulator/table.js'],
        ];
        CONFIG);
    $kernel->boot();
    $container = $kernel->getContainer();
    $twig = $container->get('test.twig');
    $assets = $container->get('test.asset_mapper');
    $importMap = $container->get('test.importmap');
    if (!$twig instanceof Environment || !$assets instanceof AssetMapperInterface || !$importMap instanceof ImportMapRenderer) {
        throw new RuntimeException('The browser fixture requires Twig and AssetMapper.');
    }

    $modules = [];
    foreach (['table', 'filter-modal', 'filter-modal-config', 'filter-operators', 'langs'] as $name) {
        $module = $assets->getAsset('@derafu/tabulator/' . $name . '.js');
        if ($module === null) {
            throw new RuntimeException('AssetMapper could not resolve the Tabulator module ' . $name . '.');
        }
        $modules[$name] = [
            'url' => $module->publicPath,
            'content' => $module->content ?? file_get_contents($module->sourcePath),
        ];
    }

    echo json_encode([
        'first' => $twig->render('@Tabulator/filter-modal.html.twig', ['modal_id' => 'first-filters']),
        'second' => $twig->render('@Tabulator/filter-modal.html.twig', ['modal_id' => 'second-filters']),
        'modules' => $modules,
        'importMap' => $importMap->render([]),
    ], JSON_THROW_ON_ERROR);
} finally {
    $kernel->shutdown();
    $filesystem->remove($projectDirectory);
}
