<?php

declare(strict_types=1);

/**
 * Derafu: Symfony Tabulator Bundle - Integrates Tabulator with API Platform.
 *
 * Copyright (c) 2026 Esteban De La Fuente Rubio / Derafu <https://www.derafu.dev>
 * Licensed under the MIT License.
 * See LICENSE file for more details.
 */

namespace Derafu\TabulatorBundle\EventSubscriber;

use Derafu\Array\ArrayReader;
use Derafu\Array\Exception\ArrayException;
use Derafu\Value\ValueType;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Maps Tabulator's remote collection parameters to API Platform request attributes.
 *
 * Runs before API Platform's providers. ReadProvider consumes _api_filters for
 * pagination and collection filters. ParameterProvider consumes
 * _api_query_parameters for declared QueryParameter objects.
 */
final class TabulatorQueryStringSubscriber implements EventSubscriberInterface
{
    /**
     * Filter operators Tabulator sends in `filter[i][type]`.
     */
    private const FILTER_TYPES = ['=', 'like', 'keywords', 'starts', 'ends', '!=', '<', '<=', '>', '>='];

    /** @return array<string, array{string, int}> */
    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::REQUEST => ['normalizeTabulatorQuery', 50],
        ];
    }

    public function normalizeTabulatorQuery(RequestEvent $event): void
    {
        // Symfony renders exceptions in a subrequest with the original query and headers.
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();

        if (!$request->isMethod('GET')) {
            return;
        }

        if (!$request->headers->contains('Accept', 'application/tabulator+json')) {
            return;
        }

        $query   = $request->query->all();
        $reader  = ArrayReader::fromArray($query);
        $filters = [];

        if (isset($query['page'])) {
            $filters['page'] = $query['page'];
        }

        if (isset($query['size'])) {
            $filters['itemsPerPage'] = $query['size'];
        } elseif (isset($query['itemsPerPage'])) {
            $filters['itemsPerPage'] = $query['itemsPerPage'];
        }

        foreach ($this->parseSort($reader) as $sort) {
            $filters['order'][$sort['field']] = $sort['dir'];
        }

        $tabulatorFilters = $this->parseFilters($reader);

        foreach ($tabulatorFilters as $filter) {
            $filters[$filter['field']] = match ($filter['type']) {
                '<'     => ['lt'  => $filter['value']],
                '<='    => ['lte' => $filter['value']],
                '>'     => ['gt'  => $filter['value']],
                '>='    => ['gte' => $filter['value']],
                '!='    => ['neq' => $filter['value']],
                default => $filter['value'],
            };
        }

        $request->attributes->set('_api_filters', $filters);

        $queryParameters = [];
        foreach ($tabulatorFilters as $filter) {
            if ($filter['value'] === '') {
                continue;
            }

            // SmartFilter accepts comparison operators as prefixes on the parameter value.
            $prefix = match ($filter['type']) {
                '<'  => '<',
                '<=' => '<=',
                '>'  => '>',
                '>=' => '>=',
                '!=' => '!=',
                default => '',
            };

            $queryParameters[$filter['field']] = $prefix . $filter['value'];
        }
        if ($queryParameters !== []) {
            $request->attributes->set('_api_query_parameters', $queryParameters);
        }
    }

    /**
     * Reads Tabulator's `sort[i][field]` and `sort[i][dir]` entries.
     *
     * @return list<array{field: string, dir: string}>
     *
     * @throws BadRequestHttpException If an entry is malformed.
     */
    private function parseSort(ArrayReader $query): array
    {
        $sorts = [];

        try {
            foreach ($query->getReaders('sort') ?? [] as $entry) {
                $sorts[] = [
                    'field' => $entry->requireNonEmptyString('field'),
                    'dir' => $entry->require('dir', ValueType::literal('asc', 'desc')),
                ];
            }
        } catch (ArrayException $e) {
            throw new BadRequestHttpException($e->getMessage(), $e);
        }

        return $sorts;
    }

    /**
     * Reads Tabulator's `filter[i][field]`, `filter[i][type]` and
     * `filter[i][value]` entries. The type defaults to equality.
     *
     * @return list<array{field: string, type: string, value: string}>
     *
     * @throws BadRequestHttpException If an entry is malformed.
     */
    private function parseFilters(ArrayReader $query): array
    {
        $filters = [];

        try {
            foreach ($query->getReaders('filter') ?? [] as $entry) {
                $filters[] = [
                    'field' => $entry->requireNonEmptyString('field'),
                    'type' => $entry->get('type', ValueType::literal(...self::FILTER_TYPES), '='),
                    'value' => $entry->requireString('value'),
                ];
            }
        } catch (ArrayException $e) {
            throw new BadRequestHttpException($e->getMessage(), $e);
        }

        return $filters;
    }
}
