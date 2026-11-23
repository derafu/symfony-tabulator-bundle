<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

namespace Derafu\TestsTabulatorBundle;

use Derafu\TabulatorBundle\EventSubscriber\TabulatorQueryStringSubscriber;
use Derafu\TabulatorBundle\Serializer\TabulatorEncoder;
use Derafu\TabulatorBundle\Serializer\TabulatorNormalizer;
use Derafu\TabulatorBundle\TabulatorBundle;
use Derafu\TestsTabulatorBundle\Fixture\Entity\Product;
use Derafu\TestsTabulatorBundle\Fixture\Kernel;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

#[CoversClass(TabulatorBundle::class)]
#[CoversClass(TabulatorQueryStringSubscriber::class)]
#[CoversClass(TabulatorEncoder::class)]
#[CoversClass(TabulatorNormalizer::class)]
final class TabulatorBundleTest extends TestCase
{
    private string $projectDirectory;

    private Kernel $kernel;

    protected function setUp(): void
    {
        $this->projectDirectory = sys_get_temp_dir() . '/derafu-tabulator-' . bin2hex(random_bytes(8));
        $this->kernel = new Kernel($this->projectDirectory);
        $this->kernel->boot();

        $manager = $this->kernel->getContainer()->get('doctrine.orm.entity_manager');
        self::assertInstanceOf(EntityManagerInterface::class, $manager);
        (new SchemaTool($manager))->createSchema([$manager->getClassMetadata(Product::class)]);

        $manager->persist(new Product(1, 'Lápiz', 30, 0));
        $manager->persist(new Product(2, 'Cuaderno', 120, 3));
        $manager->persist(new Product(3, 'Estuche', 150, 6));
        $manager->persist(new Product(4, 'Mochila', 300, 4));
        $manager->persist(new Product(5, 'Regla', 120, 5));
        $manager->flush();
        $manager->clear();
    }

    protected function tearDown(): void
    {
        $this->kernel->shutdown();
        (new Filesystem())->remove($this->projectDirectory);
    }

    public function testRemotePaginationOrderingAndFilteringOnTheSameCollection(): void
    {
        $response = $this->request([
            'page' => '2',
            'size' => '1',
            'sort' => [
                ['field' => 'price', 'dir' => 'desc'],
                ['field' => 'id', 'dir' => 'desc'],
            ],
            'filter' => [
                ['field' => 'price', 'type' => '>=', 'value' => '100'],
                ['field' => 'stock', 'type' => '<', 'value' => '6'],
            ],
        ]);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getContent());
        self::assertSame('application/tabulator+json', $response->headers->get('Content-Type'));
        self::assertSame([
            'last_page' => 3,
            'data' => [['id' => 5, 'name' => 'Regla', 'price' => 120]],
        ], $this->decode($response));
    }

    public function testItemsPerPageAliasAndCompositeSmartFilterExpression(): void
    {
        $response = $this->request([
            'itemsPerPage' => '1',
            'page' => '2',
            'filter' => [[
                'field' => '__derafu_smart_filter',
                'type' => '=',
                'value' => 'stock?>=5&&price?<=150',
            ]],
        ]);

        self::assertSame(200, $response->getStatusCode(), (string) $response->getContent());
        self::assertSame([
            'last_page' => 2,
            'data' => [['id' => 5, 'name' => 'Regla', 'price' => 120]],
        ], $this->decode($response));
    }

    public function testJsonRequestsUseTheNativeApiPlatformQueryAndResponse(): void
    {
        $response = $this->request(['stock' => '>5'], 'application/json');

        self::assertSame(200, $response->getStatusCode(), (string) $response->getContent());
        self::assertSame('application/json', $response->headers->get('Content-Type'));
        self::assertSame([['id' => 3, 'name' => 'Estuche', 'price' => 150]], $this->decode($response));
    }

    public function testInvalidRemoteSortReturnsHttpBadRequest(): void
    {
        $response = $this->request(['sort' => [['field' => 'price', 'dir' => 'invalid']]]);

        self::assertSame(400, $response->getStatusCode(), (string) $response->getContent());
    }

    /** @param array<string, mixed> $query */
    private function request(array $query, string $accept = 'application/tabulator+json'): Response
    {
        $request = Request::create(
            '/api/products?' . http_build_query($query),
            'GET',
            server: ['HTTP_ACCEPT' => $accept],
        );

        return $this->kernel->handle($request);
    }

    private function decode(Response $response): mixed
    {
        $content = $response->getContent();
        self::assertIsString($content);

        return json_decode($content, true, flags: JSON_THROW_ON_ERROR);
    }
}
