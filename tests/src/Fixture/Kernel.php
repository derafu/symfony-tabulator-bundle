<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

namespace Derafu\TestsTabulatorBundle\Fixture;

use ApiPlatform\Symfony\Bundle\ApiPlatformBundle;
use Derafu\QueryBundle\QueryBundle;
use Derafu\TabulatorBundle\Serializer\TabulatorEncoder;
use Derafu\TabulatorBundle\TabulatorBundle;
use Doctrine\Bundle\DoctrineBundle\DoctrineBundle;
use Symfony\Bundle\FrameworkBundle\FrameworkBundle;
use Symfony\Component\Config\Loader\LoaderInterface;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\HttpKernel\Bundle\BundleInterface;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;

final class Kernel extends BaseKernel
{
    public function __construct(private readonly string $projectDirectory)
    {
        parent::__construct('test', true);
    }

    /** @return iterable<BundleInterface> */
    public function registerBundles(): iterable
    {
        yield new FrameworkBundle();
        yield new DoctrineBundle();
        yield new ApiPlatformBundle();
        yield new QueryBundle();
        yield new TabulatorBundle();
    }

    public function registerContainerConfiguration(LoaderInterface $loader): void
    {
        $loader->load(static function (ContainerBuilder $container): void {
            $container->loadFromExtension('framework', [
                'secret' => 'tabulator-test-secret',
                'router' => ['resource' => dirname(__DIR__, 2) . '/fixtures/routes.yaml'],
            ]);

            $container->loadFromExtension('doctrine', [
                'dbal' => ['driver' => 'pdo_sqlite', 'memory' => true],
                'orm' => ['mappings' => ['TabulatorFixture' => [
                    'type' => 'attribute',
                    'dir' => __DIR__ . '/Entity',
                    'prefix' => 'Derafu\\TestsTabulatorBundle\\Fixture\\Entity',
                    'is_bundle' => false,
                ]]],
            ]);

            $container->loadFromExtension('api_platform', [
                'mapping' => ['paths' => [__DIR__ . '/Entity']],
                'formats' => [
                    'json' => ['application/json'],
                    TabulatorEncoder::FORMAT => ['application/tabulator+json'],
                ],
                'error_formats' => ['jsonproblem' => ['application/problem+json']],
                'enable_docs' => false,
                'enable_entrypoint' => false,
                'enable_re_doc' => false,
                'enable_swagger_ui' => false,
            ]);
        });
    }

    public function getProjectDir(): string
    {
        return $this->projectDirectory;
    }
}
