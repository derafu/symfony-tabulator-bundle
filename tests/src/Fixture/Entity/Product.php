<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

namespace Derafu\TestsTabulatorBundle\Fixture\Entity;

use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\RangeFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\QueryParameter;
use Derafu\Query\Bridge\ApiPlatform\SmartFilter;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(
    operations: [
        new GetCollection(uriTemplate: '/products'),
        new Get(uriTemplate: '/products/{id}'),
    ],
    normalizationContext: ['groups' => ['product:read']],
    order: ['id' => 'ASC'],
    paginationItemsPerPage: 2,
    paginationClientItemsPerPage: true,
)]
#[ApiFilter(OrderFilter::class, properties: ['id', 'price'])]
#[ApiFilter(RangeFilter::class, properties: ['price'])]
#[QueryParameter(key: 'stock', property: 'stock', filter: SmartFilter::class)]
#[QueryParameter(key: '__derafu_smart_filter', property: '__derafu_smart_filter', filter: SmartFilter::class)]
class Product
{
    public function __construct(
        #[ORM\Id]
        #[ORM\Column]
        #[Groups(['product:read'])]
        public int $id,
        #[ORM\Column]
        #[Groups(['product:read'])]
        public string $name,
        #[ORM\Column]
        #[Groups(['product:read'])]
        public int $price,
        #[ORM\Column]
        public int $stock,
    ) {
    }
}
