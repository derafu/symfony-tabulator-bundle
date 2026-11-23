import {expect, test} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);
const {first, second, modules, importMap} = JSON.parse(execFileSync('php', ['tests/browser/render-modals.php'], {encoding: 'utf8'}));
const assets = {
    '/bootstrap.js': ['text/javascript', require.resolve('bootstrap/dist/js/bootstrap.bundle.min.js')],
    '/bootstrap.css': ['text/css', require.resolve('bootstrap/dist/css/bootstrap.min.css')],
    '/tabulator.js': ['text/javascript', require.resolve('tabulator-tables/dist/js/tabulator.min.js')],
    '/tabulator.css': ['text/css', require.resolve('tabulator-tables/dist/css/tabulator_bootstrap5.min.css')],
};

function filtersForField(url, field) {
    const matching = [];
    for (let index = 0; url.searchParams.has(`filter[${index}][field]`); index++) {
        if (url.searchParams.get(`filter[${index}][field]`) === field) {
            matching.push({
                type: url.searchParams.get(`filter[${index}][type]`),
                value: url.searchParams.get(`filter[${index}][value]`),
            });
        }
    }
    return matching;
}

function sawFilter(requests, table, field, type, value) {
    return requests.some(url => {
        const filters = filtersForField(url, field);
        return url.pathname === '/api/' + table
            && filters.length === 1 && filters[0].type === type && filters[0].value === value;
    });
}

async function openTables(page, search, {separateTables = false, nativeHeader = false, tableOptions = {}} = {}) {
    const errors = [];
    const requests = [];
    const headers = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://tables.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/')) {
            requests.push(url);
            headers.push({path: url.pathname, ...route.request().headers()});
            return route.fulfill({json: {last_page: 1, data: [{status: 'paid', owner: 'team'}]}});
        }
        if (assets[url.pathname]) {
            const [contentType, file] = assets[url.pathname];
            return route.fulfill({contentType, body: readFileSync(file)});
        }
        const module = Object.values(modules).find(module => module.url === url.pathname);
        if (module) {
            return route.fulfill({contentType: 'text/javascript', body: module.content});
        }
        return route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html>
                <link rel="stylesheet" href="/bootstrap.css">
                <link rel="stylesheet" href="/tabulator.css">
                <button data-bs-toggle="modal" data-bs-target="#first-filters">First filters</button>
                <div id="first-table"></div>${first}
                <button data-bs-toggle="modal" data-bs-target="#second-filters">Second filters</button>
                <div id="second-table"></div>${second}
                <script src="/bootstrap.js"></script>
                <script src="/tabulator.js"></script>
                ${importMap}
                <script type="module">
                    import {initTabulatorTable} from '@derafu/tabulator/table';
                    window.tables = {};
                    window.built = 0;
                    for (const name of ['first', 'second']) {
                        const advanced = name === 'second';
                        const table = initTabulatorTable({
                            element: '#' + name + '-table',
                            ...(advanced ? {remote: {url: '/api/' + name, headers: {Authorization: 'Bearer example'}}} : {}),
                            options: {
                                ...(!advanced ? {
                                    ajaxURL: '/api/' + name,
                                    filterMode: 'remote',
                                    pagination: true,
                                    paginationMode: 'remote',
                                } : {}),
                                initialFilter: [{field: 'owner', type: '=', value: 'team'}],
                                columns: [
                                    {title: 'Status', field: 'status', ...(advanced || ${nativeHeader} ? {headerFilter: 'input'} : {})},
                                    {title: 'Owner', field: 'owner'},
                                    {title: '', field: 'action', ...(advanced ? {headerFilter: 'input'} : {})},
                                ],
                                ...(${JSON.stringify(tableOptions)}[name]),
                            },
                            filterModal: {
                                modal: document.querySelector('#' + name + '-filters'),
                                ...(!advanced ? {fields: {status: {operators: ['=', '!=', 'like']}}} : {}),
                                mode: advanced ? 'smart-filter' : 'native',
                                expression: advanced,
                                ...(${separateTables} ? {urlSync: true, urlPrefix: name} : {}),
                                ...(!advanced ? {urlSync: true} : {}),
                            },
                        });
                        window.tables[name] = table;
                        table.on('tableBuilt', () => window.built++);
                    }
                </script>`,
        });
    });
    await page.goto('https://tables.test/' + search);
    await expect.poll(() => page.evaluate(() => window.built)).toBe(2);
    expect(errors).toEqual([]);

    return {requests, headers, errors};
}

test('loads complete catalogues from the locale alone', async ({page}) => {
    const {errors} = await openTables(page, '', {
        nativeHeader: true,
        tableOptions: {first: {locale: 'es'}, second: {locale: 'ht'}},
    });
    const firstTable = page.locator('#first-table');
    const secondTable = page.locator('#second-table');
    await expect(firstTable.getByRole('button', {name: 'Primera página', exact: true})).toHaveText('Primera');
    await expect(firstTable.getByPlaceholder('Filtrar columna…')).toBeVisible();
    await expect(secondTable.getByRole('button', {name: 'Premye paj', exact: true})).toHaveText('Premye');

    const keys = await page.evaluate(() => {
        function messageKeys(catalogue, prefix = '') {
            return Object.entries(catalogue).flatMap(([key, value]) => value && typeof value === 'object'
                ? messageKeys(value, prefix + key + '.') : [prefix + key]).sort();
        }
        return ['default', 'es', 'ht', 'zh_Hans'].map(locale => messageKeys(window.tables.first.getLang(locale)));
    });
    expect(keys[0]).toHaveLength(20);
    expect(keys.slice(1)).toEqual([keys[0], keys[0], keys[0]]);

    await page.evaluate(() => window.tables.first.setLocale('zh_Hans'));
    await expect(firstTable.getByPlaceholder('筛选列…')).toBeVisible();
    await page.evaluate(() => window.tables.first.setLocale('zh-Hans'));
    await expect(firstTable.getByRole('button', {name: '首页', exact: true})).toHaveText('第一页');
    await page.evaluate(() => window.tables.first.setLocale('en'));
    await expect(firstTable.getByRole('button', {name: 'First Page', exact: true})).toHaveText('First');
    expect(await page.evaluate(() => window.tables.first.getLocale())).toBe('en');
    expect(errors).toEqual([]);
});

test('keeps custom catalogues scoped to their table', async ({page}) => {
    await openTables(page, '', {
        tableOptions: {
            first: {locale: 'es', langs: {es: {pagination: {first: 'Inicio'}}}},
            second: {locale: 'es'},
        },
    });
    await expect(page.locator('#first-table').getByRole('button', {name: 'First Page', exact: true})).toHaveText('Inicio');
    await expect(page.locator('#second-table').getByRole('button', {name: 'Primera página', exact: true})).toHaveText('Primera');
});

test('keeps the operator reference in a read-only tab and copies only the operator', async ({page, context}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: 'https://tables.test'});
    const {errors} = await openTables(page, '');

    await page.getByRole('button', {name: 'Second filters'}).click();
    const modal = page.locator('#second-filters');
    await modal.getByRole('tab', {name: 'Smart Filter expression'}).click();
    const expression = modal.getByRole('textbox', {name: 'Complete Smart Filter expression'});
    await expect(expression)
        .toHaveAccessibleDescription('Use the format path?operatorValue. For example, amount?between:1000,5000.');
    await expect(modal.locator('#second-filters-expression-help code'))
        .toHaveText(['path?operatorValue', 'amount?between:1000,5000']);
    const operators = modal.getByRole('tab', {name: 'Operators', exact: true});
    const reference = modal.getByRole('tabpanel', {name: 'Operators', exact: true});
    const apply = modal.locator('[data-filter-apply]');
    const clear = modal.locator('[data-filter-clear]');
    await expect(reference).toBeHidden();
    await expect(apply).toBeVisible();
    await expect(clear).toBeVisible();
    await operators.click();
    await expect(expression).toBeHidden();
    await expect(reference).toBeVisible();
    await expect(apply).toBeHidden();
    await expect(clear).toBeHidden();

    const range = modal.getByRole('row').filter({has: page.getByRole('cell', {name: 'Between', exact: true})});
    await expect(range.getByRole('cell', {name: 'between:1000,5000', exact: true})).toBeVisible();
    const isEmpty = modal.getByRole('row').filter({has: page.getByRole('cell', {name: 'Is empty', exact: true})});
    await expect(isEmpty.getByRole('cell').last()).toHaveText('is:null');
    const copy = range.getByRole('button', {name: 'Copy operator between:', exact: true});
    await expect(copy).toHaveAttribute('title', 'Copy operator');
    await expect(copy).toHaveText('');
    const copyIcon = copy.locator('[data-copy-icon="idle"]');
    await expect(copyIcon).toBeVisible();
    await copy.click();
    const status = modal.getByRole('status');
    await expect(status).toHaveText('Operator copied.');
    await expect(status).toHaveClass('visually-hidden');
    await expect(copy.locator('[data-copy-icon="copied"]')).toBeVisible();
    await expect(copyIcon).toBeHidden();
    await expect(copy).toHaveClass(/\bbtn-outline-success\b/);
    await expect(copy).toHaveAttribute('title', 'Operator copied.');
    await expect(copy).toBeFocused();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('between:');
    await expect(copyIcon).toBeVisible();
    await expect(copy).toHaveAttribute('title', 'Copy operator');

    await page.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    });
    await copy.click();
    await expect(status).toHaveText('Could not copy the operator.');
    await expect(copy.locator('[data-copy-icon="copyFailed"]')).toBeVisible();
    await expect(copyIcon).toBeHidden();
    await expect(copy).toHaveClass(/\bbtn-outline-danger\b/);
    await expect(copy).toHaveAttribute('title', 'Could not copy the operator.');
    await expect(copyIcon).toBeVisible();
    await expect(copy).toHaveAttribute('title', 'Copy operator');

    await modal.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(modal).toBeHidden();
    await page.getByRole('button', {name: 'Second filters'}).click();
    await expect(reference).toBeVisible();
    await expect(apply).toBeHidden();
    await modal.getByRole('tab', {name: 'Guided filters'}).click();
    await expect(reference).toBeHidden();
    await expect(apply).toBeVisible();
    await expect(clear).toBeVisible();
    expect(errors).toEqual([]);
});

test('restores and updates an unprefixed URL by default without changing unrelated params', async ({page}) => {
    const {requests, errors} = await openTables(page, '?status=paid&view=summary#details');
    await expect.poll(() => sawFilter(requests, 'first', 'status', '=', 'paid')).toBe(true);
    const initialRequest = requests.find(url => url.pathname === '/api/first');
    expect(filtersForField(initialRequest, 'status')).toEqual([{type: '=', value: 'paid'}]);
    expect(filtersForField(initialRequest, 'owner')).toEqual([{type: '=', value: 'team'}]);
    expect(requests.filter(url => url.pathname === '/api/first')).toHaveLength(1);

    await page.getByRole('button', {name: 'First filters'}).click();
    const modal = page.locator('#first-filters');
    await expect(modal.getByRole('tablist')).toBeHidden();
    await expect(modal.getByRole('combobox', {name: 'Field'})).toHaveValue('status');
    await expect(modal.getByRole('textbox', {name: 'Value'})).toHaveValue('paid');
    await modal.getByRole('combobox', {name: 'Operator'}).selectOption('!=');
    await modal.getByRole('textbox', {name: 'Value'}).fill('pending');
    await modal.getByRole('button', {name: 'Apply', exact: true}).click();
    await expect(modal).toBeHidden();
    await expect.poll(() => sawFilter(requests, 'first', 'status', '!=', 'pending')).toBe(true);

    const url = new URL(page.url());
    expect(Object.fromEntries(url.searchParams)).toEqual({view: 'summary', status: '!=:pending'});
    expect(url.hash).toBe('#details');
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.built)).toBe(2);
    await page.getByRole('button', {name: 'First filters'}).click();
    await expect(modal.getByRole('combobox', {name: 'Operator'})).toHaveValue('!=');
    await expect(modal.getByRole('textbox', {name: 'Value'})).toHaveValue('pending');
    await modal.getByRole('button', {name: 'Clear all'}).click();
    await expect.poll(() => new URL(page.url()).search).toBe('?view=summary');
    await expect(modal).toBeHidden();

    await page.getByRole('button', {name: 'Second filters'}).click();
    const secondModal = page.locator('#second-filters');
    await secondModal.getByRole('textbox', {name: 'Value'}).fill('paid');
    await secondModal.getByRole('button', {name: 'Apply', exact: true}).click();
    await expect(secondModal).toBeHidden();
    await expect.poll(() => sawFilter(requests, 'second', 'status', '=', '=paid')).toBe(true);
    expect(new URL(page.url()).search).toBe('?view=summary');
    expect(errors).toEqual([]);
});

test('keeps two tables, their URL filters and headers independent', async ({page}) => {
    const {requests, headers, errors} = await openTables(page, '?first.status=paid&second.status=%3Dpending&view=list', {separateTables: true});
    await expect.poll(() => headers.find(request => request.path === '/api/second')).toMatchObject({
        accept: 'application/tabulator+json',
        authorization: 'Bearer example',
    });
    await expect.poll(() => headers.find(request => request.path === '/api/first')?.accept).toBe('application/json');
    await page.getByRole('button', {name: 'Second filters'}).click();
    const secondModal = page.locator('#second-filters');
    await expect(secondModal.getByRole('combobox', {name: 'Field'}).locator('option')).toHaveCount(1);
    await expect(secondModal.getByRole('combobox', {name: 'Field'})).toHaveValue('status');
    await expect(secondModal.getByRole('textbox', {name: 'Value'})).toHaveValue('pending');
    await secondModal.getByRole('combobox', {name: 'Operator'}).selectOption('!=');
    await secondModal.getByRole('button', {name: 'Apply', exact: true}).click();
    await expect(secondModal).toBeHidden();
    await expect.poll(() => sawFilter(requests, 'second', 'status', '=', '!=pending')).toBe(true);

    const statusHeader = page.locator('#second-table .tabulator-col[tabulator-field="status"] input');
    await expect(statusHeader).toHaveValue('!=pending');
    await statusHeader.press('ControlOrMeta+a');
    await statusHeader.pressSequentially('approved');
    await expect.poll(() => sawFilter(requests, 'second', 'status', '=', '~~approved')).toBe(true);
    await expect.poll(() => new URL(page.url()).searchParams.get('second.status')).toBe('~~approved');

    await page.getByRole('button', {name: 'Second filters'}).click();
    await expect(secondModal.getByRole('combobox', {name: 'Operator'})).toHaveValue('~~');
    await expect(secondModal.getByRole('textbox', {name: 'Value'})).toHaveValue('approved');
    await secondModal.getByRole('tab', {name: 'Smart Filter expression'}).click();
    const expression = 'status?=paid&&owner?=team';
    await secondModal.getByRole('textbox', {name: 'Complete Smart Filter expression'}).fill(expression);
    await secondModal.getByRole('button', {name: 'Apply', exact: true}).click();
    await expect(secondModal).toBeHidden();
    await expect.poll(() => sawFilter(requests, 'second', '__derafu_smart_filter', '=', expression)).toBe(true);
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
        'first.status': 'paid',
        'second.__derafu_smart_filter': expression,
        view: 'list',
    });

    await page.goto('https://tables.test/?first.status=paid&second.status=%3Dpending&view=list');
    await expect.poll(() => page.evaluate(() => window.built)).toBe(2);
    await page.evaluate(() => {
        window.tables.second.setHeaderFilterValue('action', 'archive');
        window.tables.second.setHeaderFilterValue('status', '=paid');
    });
    await page.getByRole('button', {name: 'Second filters'}).click();
    await secondModal.getByRole('button', {name: 'Clear all'}).click();
    await expect(secondModal).toBeHidden();
    expect(await page.evaluate(() => window.tables.second.getHeaderFilters())).toEqual([
        {field: 'action', type: 'like', value: 'archive'},
    ]);
    await expect.poll(() => sawFilter(requests, 'second', 'action', 'like', 'archive')).toBe(true);
    expect(await page.evaluate(() => window.tables.first.getFilters())).toContainEqual(
        {field: 'status', type: '=', value: 'paid'},
    );
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({'first.status': 'paid', view: 'list'});
    expect(errors).toEqual([]);
});

test('sends both inferred SmartFilter fields on the first remote request', async ({page}) => {
    const {requests, errors} = await openTables(page, '?second.status=%3Dpaid&second.owner=%3Dteam', {
        separateTables: true,
        tableOptions: {
            second: {
                columnDefaults: {headerFilter: 'input'},
                columns: [{title: 'Orders', columns: [
                    {title: 'Status', field: 'status'},
                    {title: 'Owner', field: 'owner'},
                ]}],
            },
        },
    });

    const initialRequests = requests.filter(url => url.pathname === '/api/second');
    expect(initialRequests).toHaveLength(1);
    expect(filtersForField(initialRequests[0], 'status')).toEqual([{type: '=', value: '=paid'}]);
    expect(filtersForField(initialRequests[0], 'owner')).toEqual([{type: '=', value: '=team'}]);
    await expect(page.locator('#second-table input').nth(0)).toHaveValue('=paid');
    await expect(page.locator('#second-table input').nth(1)).toHaveValue('=team');
    expect(errors).toEqual([]);
});

test('normalizes SmartFilter headers without mounting a modal', async ({page}) => {
    const {requests, errors} = await openTables(page, '');
    await page.evaluate(async () => {
        const {initTabulatorTable} = await import('@derafu/tabulator/table');
        const element = document.createElement('div');
        document.body.append(element);
        const table = initTabulatorTable({
            element,
            remote: {url: '/api/unmounted', smartFilter: true},
            options: {columns: [{title: 'Status', field: 'status', headerFilter: 'input'}]},
        });
        table.on('tableBuilt', () => table.setHeaderFilterValue('status', 'test'));
    });

    await expect.poll(() => sawFilter(requests, 'unmounted', 'status', '=', '~~test')).toBe(true);
    expect(errors).toEqual([]);
});

test('rejects invalid modal configuration before constructing a table', async ({page}) => {
    const {requests} = await openTables(page, '');
    const result = await page.evaluate(async () => {
        const {initTabulatorTable} = await import('@derafu/tabulator/table');
        let constructions = 0;
        class CountingTabulator extends window.Tabulator {
            constructor(...args) {
                super(...args);
                constructions++;
            }
        }
        const malformed = document.createElement('div');
        const mounted = document.querySelector('#second-filters');
        const unused = mounted.cloneNode(true);
        const errors = [{}, {modal: malformed}, {modal: mounted}, {modal: unused, expression: true}].map(filterModal => {
            const element = document.createElement('div');
            document.body.append(element);
            try {
                initTabulatorTable({element, remote: {url: '/api/invalid'}, filterModal, Tabulator: CountingTabulator});
            } catch (error) {
                return error.message;
            }
        });
        return {errors, constructions};
    });
    expect(result.errors).toEqual([
        'A filter modal and supported filter mode are required.',
        'The filter modal markup is incomplete.',
        'The filter modal is already mounted.',
        'The expression editor requires smart-filter mode.',
    ]);
    expect(result.constructions).toBe(0);
    expect(requests.some(url => url.pathname === '/api/invalid')).toBe(false);
});

test('editing a native header replaces a modal filter with a different operator', async ({page}) => {
    const {requests, errors} = await openTables(page, '', {nativeHeader: true});
    await page.getByRole('button', {name: 'First filters'}).click();
    const modal = page.locator('#first-filters');
    await modal.getByRole('combobox', {name: 'Operator'}).selectOption('!=');
    await modal.getByRole('textbox', {name: 'Value'}).fill('pending');
    await modal.getByRole('button', {name: 'Apply', exact: true}).click();
    await expect(modal).toBeHidden();
    await expect.poll(() => sawFilter(requests, 'first', 'status', '!=', 'pending')).toBe(true);

    const header = page.locator('#first-table .tabulator-col[tabulator-field="status"] input');
    await header.pressSequentially('paid');
    await expect.poll(() => sawFilter(requests, 'first', 'status', 'like', 'paid')).toBe(true);
    await page.getByRole('button', {name: 'First filters'}).click();
    await expect(modal.getByRole('combobox', {name: 'Operator'})).toHaveValue('like');
    await expect(modal.getByRole('textbox', {name: 'Value'})).toHaveValue('paid');
    expect(errors).toEqual([]);
});
