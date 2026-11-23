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

use Derafu\TabulatorBundle\EventSubscriber\TabulatorQueryStringSubscriber;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\HttpKernelInterface;

#[CoversClass(TabulatorQueryStringSubscriber::class)]
final class TabulatorQueryStringSubscriberTest extends TestCase
{
    /** @return iterable<string, array{?string, string|array<string, string>, string}> */
    public static function operators(): iterable
    {
        yield 'default equality' => [null, '100', '100'];
        yield 'equality' => ['=', '100', '100'];
        yield 'like' => ['like', '100', '100'];
        yield 'keywords' => ['keywords', '100', '100'];
        yield 'starts' => ['starts', '100', '100'];
        yield 'ends' => ['ends', '100', '100'];
        yield 'less than' => ['<', ['lt' => '100'], '<100'];
        yield 'less than or equal' => ['<=', ['lte' => '100'], '<=100'];
        yield 'greater than' => ['>', ['gt' => '100'], '>100'];
        yield 'greater than or equal' => ['>=', ['gte' => '100'], '>=100'];
        yield 'inequality' => ['!=', ['neq' => '100'], '!=100'];
    }

    /** @param string|array<string, string> $collectionFilter */
    #[DataProvider('operators')]
    public function testOperatorsMapToCollectionFiltersAndQueryParameters(
        ?string $operator,
        string|array $collectionFilter,
        string $parameter,
    ): void {
        $filter = ['field' => 'price', 'value' => '100'];
        if ($operator !== null) {
            $filter['type'] = $operator;
        }

        $request = $this->dispatch(['filter' => [$filter]]);

        self::assertSame(['price' => $collectionFilter], $request->attributes->get('_api_filters'));
        self::assertSame(['price' => $parameter], $request->attributes->get('_api_query_parameters'));
    }

    public function testSizeTakesPrecedenceAndEmptyFiltersDoNotBecomeQueryParameters(): void
    {
        $request = $this->dispatch([
            'page' => '2',
            'size' => '5',
            'itemsPerPage' => '9',
            'filter' => [['field' => 'name', 'type' => 'like', 'value' => '']],
        ]);

        self::assertSame([
            'page' => '2',
            'itemsPerPage' => '5',
            'name' => '',
        ], $request->attributes->get('_api_filters'));
        self::assertFalse($request->attributes->has('_api_query_parameters'));
    }

    /** @return iterable<string, array{string, string, 2?: int}> */
    public static function otherRequests(): iterable
    {
        yield 'write request' => ['POST', 'application/tabulator+json'];
        yield 'plain json' => ['GET', 'application/json'];
        yield 'no accept header' => ['GET', ''];
        yield 'subrequest' => ['GET', 'application/tabulator+json', HttpKernelInterface::SUB_REQUEST];
    }

    #[DataProvider('otherRequests')]
    public function testOtherRequestsAreIgnored(
        string $method,
        string $accept,
        int $requestType = HttpKernelInterface::MAIN_REQUEST,
    ): void {
        $request = $this->dispatch(['page' => '2', 'sort' => 'invalid'], $method, $accept, $requestType);
        self::assertFalse($request->attributes->has('_api_filters'));
        self::assertFalse($request->attributes->has('_api_query_parameters'));
    }

    /** @return iterable<string, array{array<string, mixed>}> */
    public static function malformedQueries(): iterable
    {
        yield 'scalar sort' => [['sort' => 'price']];
        yield 'scalar sort entry' => [['sort' => ['price']]];
        yield 'missing sort field' => [['sort' => [['dir' => 'asc']]]];
        yield 'invalid direction' => [['sort' => [['field' => 'price', 'dir' => 'sideways']]]];
        yield 'scalar filter' => [['filter' => 'name']];
        yield 'scalar filter entry' => [['filter' => ['name']]];
        yield 'empty filter field' => [['filter' => [['field' => '', 'value' => 'book']]]];
        yield 'unknown operator' => [['filter' => [['field' => 'name', 'type' => 'unknown', 'value' => 'book']]]];
        yield 'missing filter value' => [['filter' => [['field' => 'name']]]];
        yield 'non-string filter value' => [['filter' => [['field' => 'name', 'value' => ['book']]]]];
    }

    /** @param array<string, mixed> $query */
    #[DataProvider('malformedQueries')]
    public function testMalformedQueriesAreRejected(array $query): void
    {
        $this->expectException(BadRequestHttpException::class);
        $this->dispatch($query);
    }

    /** @param array<string, mixed> $query */
    private function dispatch(
        array $query,
        string $method = 'GET',
        string $accept = 'application/tabulator+json',
        int $requestType = HttpKernelInterface::MAIN_REQUEST,
    ): Request {
        $request = Request::create('/api/products?' . http_build_query($query), $method);
        if ($accept !== '') {
            $request->headers->set('Accept', $accept);
        }

        $event = new RequestEvent($this->createStub(HttpKernelInterface::class), $request, $requestType);
        (new TabulatorQueryStringSubscriber())->normalizeTabulatorQuery($event);

        return $request;
    }
}
