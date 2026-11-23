import {hasSmartTextHeader, nativeOperators, smartOperand, smartOperators} from './filter-operators.js';

export const expressionField = '__derafu_smart_filter';
export const mountedModals = new WeakSet();
const remoteTypes = new Set(nativeOperators);
const modalElements = [
    '[data-filter-form]', '[data-filter-rows]', '[data-filter-error]', '[data-filter-expression]',
    '[data-filter-tabs]', '[data-filter-guided-tab]', '[data-filter-expression-tab]', '[data-filter-operators-tab]',
    '[data-filter-clear]', '[data-filter-apply]', '[data-filter-add]', '[data-filter-operators]',
    '[data-filter-copy-status]', '[data-bs-dismiss="modal"]',
];

function columnDefinitions(fields, smart) {
    return new Map(Object.entries(fields).map(([field, {operators, label}]) => {
        if (field === '' || field === expressionField || !Array.isArray(operators) || operators.length === 0
            || operators.some(operator => typeof operator !== 'string' || !operator || (!smart && !remoteTypes.has(operator)))) {
            throw new TypeError(`Invalid filter configuration for "${field}".`);
        }

        return [field, {
            label,
            operators: [...new Set(operators)],
            longestFirst: [...operators].sort((left, right) => right.length - left.length),
        }];
    }));
}

export function decodeValue(column, rawValue, smart) {
    if (smart) {
        return smartOperand(rawValue, column.operators);
    }
    const operator = column.longestFirst.find(symbol => rawValue.startsWith(`${symbol}:`));
    if (!operator) {
        return {operator: column.operators[0], value: rawValue};
    }

    return {operator, value: rawValue.slice(operator.length + 1)};
}

export function toTableFilter({field, operator, value}, smart) {
    return smart
        ? {field, type: '=', value: operator + value}
        : {field, type: operator, value};
}

export function prepareFilterModal({modal, fields, mode = 'native', expression = false, urlSync = false, urlPrefix = ''}) {
    if (!modal?.ownerDocument?.defaultView || typeof modal.querySelector !== 'function'
        || !['native', 'smart-filter'].includes(mode)) {
        throw new TypeError('A filter modal and supported filter mode are required.');
    }
    if (mountedModals.has(modal)) {
        throw new TypeError('The filter modal is already mounted.');
    }
    if (expression && mode !== 'smart-filter') {
        throw new TypeError('The expression editor requires smart-filter mode.');
    }

    const row = modal.querySelector('[data-filter-row]')?.content?.firstElementChild;
    const labels = modal.querySelector('[data-filter-operator-labels]')?.content;
    const operatorRow = modal.querySelector('[data-filter-operator-row]')?.content?.firstElementChild;
    if (modalElements.some(selector => !modal.querySelector(selector))
        || !labels
        || ['field', 'operator', 'value', 'remove'].some(name => !row?.querySelector(`[data-filter-${name}]`))
        || (expression && ['operator-symbol', 'operator-description', 'operator-example', 'copy']
            .some(name => !operatorRow?.querySelector(`[data-filter-${name}]`)))) {
        throw new TypeError('The filter modal markup is incomplete.');
    }

    const smart = mode === 'smart-filter';
    const columns = fields === undefined ? undefined : columnDefinitions(fields, smart);
    if (columns?.size === 0 && !expression) {
        throw new TypeError('At least one filter field or the expression editor is required.');
    }
    return {modal, fields: columns, smart, expression, urlSync, urlPrefix};
}

export function fieldsForColumns(definitions, smart) {
    const operators = smart ? smartOperators : nativeOperators;
    return columnDefinitions(Object.fromEntries(definitions
        .filter(({field, title, headerFilter}) => field && field !== expressionField && title && headerFilter)
        .map(({field, title}) => [field, {operators, label: title}])), smart);
}

export function readUrlFilters({columns, smart, expression, key, params}) {
    const filters = [];
    const advanced = expression && params.get(key(expressionField));
    if (advanced) {
        filters.push({field: expressionField, type: '=', value: advanced});
    }
    for (const [field, column] of columns) {
        const value = params.get(key(field));
        if (value) {
            filters.push(toTableFilter({field, ...decodeValue(column, value, smart)}, smart));
        }
    }
    return filters;
}

function declaredColumns(columns, defaults) {
    return columns.flatMap(column => column.columns
        ? declaredColumns(column.columns, defaults)
        : [{...defaults, ...Object.fromEntries(Object.entries(column).filter(([, value]) => value !== undefined))}]);
}

export function initialUrlOptions(options, config) {
    if (!config?.urlSync || (options.autoColumns && config.fields === undefined)) {
        return {};
    }

    const {modal, fields, smart, expression, urlPrefix} = config;
    const definitions = options.autoColumns ? [] : declaredColumns(options.columns ?? [], options.columnDefaults);
    const columns = fields ?? fieldsForColumns(definitions, smart);
    const params = new URL(modal.ownerDocument.defaultView.location.href).searchParams;
    const key = field => urlPrefix ? `${urlPrefix}.${field}` : field;
    const filters = readUrlFilters({columns, smart, expression, key, params});
    if (filters.length === 0) {
        return {};
    }

    const isManaged = ({field}) => columns.has(field) || (expression && field === expressionField);
    const initialFilter = (options.initialFilter || []).filter(filter => !isManaged(filter));
    const initialHeaderFilter = (options.initialHeaderFilter || []).filter(filter => !isManaged(filter));
    const smartHeaders = new Set(definitions.filter(hasSmartTextHeader).map(({field}) => field));
    for (const filter of filters) {
        if (smart && smartHeaders.has(filter.field)) {
            initialHeaderFilter.push({field: filter.field, value: filter.value});
        } else {
            initialFilter.push(filter);
        }
    }
    return {initialFilter, initialHeaderFilter};
}

