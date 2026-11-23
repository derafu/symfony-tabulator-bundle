import {connectFilterModal} from './filter-modal.js';
import {initialUrlOptions, prepareFilterModal} from './filter-modal-config.js';
import {hasSmartTextHeader, smartOperand, smartOperators} from './filter-operators.js';
import {langs} from './langs.js';

const mediaType = 'application/tabulator+json';

function requestOptions(tableOptions, {url, headers, smartFilter}, filterModal) {
    const ajaxConfig = typeof tableOptions.ajaxConfig === 'string'
        ? {method: tableOptions.ajaxConfig}
        : tableOptions.ajaxConfig;
    const requestHeaders = new Headers(ajaxConfig?.headers);
    new Headers(headers).forEach((value, name) => requestHeaders.set(name, value));
    requestHeaders.delete('Accept');

    const options = {
        pagination: true,
        paginationMode: 'remote',
        sortMode: 'remote',
        filterMode: 'remote',
        ...tableOptions,
        ajaxURL: url,
        ajaxConfig: {
            ...ajaxConfig,
            headers: {...Object.fromEntries(requestHeaders), Accept: mediaType},
        },
    };
    if (!(smartFilter ?? filterModal?.smart)) {
        return options;
    }

    const filterKey = tableOptions.dataSendParams?.filter ?? 'filter';
    const beforeRequest = tableOptions.ajaxRequesting;
    options.ajaxRequesting = function (requestUrl, params) {
        // Tabulator sends its header value verbatim. SmartFilter needs an operator
        // even when the user types plain text in a header.
        if (Array.isArray(params[filterKey])) {
            const headerValues = new Map(this.getHeaderFilters().map(({field, value}) => [field, value]));
            params[filterKey] = params[filterKey].map(filter => {
                if ((filter.type !== 'like' && filter.type !== '=')
                    || typeof filter.value !== 'string' || filter.value !== headerValues.get(filter.field)) {
                    return filter;
                }
                const field = filter.field;
                const fields = filterModal?.fields;
                const definition = this.getColumn(field)?.getDefinition?.();
                if ((fields === undefined ? !definition?.title : !fields.has(field))
                    || !hasSmartTextHeader(definition)) {
                    return filter;
                }
                const decoded = smartOperand(filter.value, fields?.get(field)?.operators ?? smartOperators);
                return {...filter, type: '=', value: decoded.operator + decoded.value};
            });
        }

        return beforeRequest?.call(this, requestUrl, params);
    };
    return options;
}

/**
 * Creates a Tabulator and optionally connects its filter modal.
 * Supply remote to use the API Platform request format.
 */
export function initTabulatorTable({
    element,
    options = {},
    remote,
    filterModal,
    Tabulator: Table = globalThis.Tabulator,
}) {
    if (typeof Table !== 'function' || !element) {
        throw new TypeError('A Tabulator constructor and table element are required.');
    }

    const modal = filterModal ? prepareFilterModal(filterModal) : null;
    const tableOptions = {
        ...options,
        ...initialUrlOptions(options, modal),
        langs: {...langs, ...options.langs},
    };
    const table = new Table(element, remote ? requestOptions(tableOptions, remote, modal) : tableOptions);
    if (modal) {
        connectFilterModal(table, modal);
    }
    return table;
}
