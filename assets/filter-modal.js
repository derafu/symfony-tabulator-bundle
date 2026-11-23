import {hasSmartTextHeader, smartOperators} from './filter-operators.js';
import {
    decodeValue, expressionField, fieldsForColumns, mountedModals, prepareFilterModal,
    readUrlFilters, toTableFilter,
} from './filter-modal-config.js';

const noOperand = new Set(['is:null', 'isnot:null']);

/**
 * Connects a rendered Bootstrap filter modal to one Tabulator instance.
 * Call immediately after constructing the table. Returns a cleanup function.
 */
export function mountFilterModal({table, ...options}) {
    if (!table) {
        throw new TypeError('A Tabulator table is required.');
    }

    return connectFilterModal(table, prepareFilterModal(options));
}

/** @internal Connects a modal whose configuration has already been validated. */
export function connectFilterModal(table, {modal, fields, smart, expression, urlSync, urlPrefix}) {
    let columns = fields ?? new Map();
    const document = modal.ownerDocument;
    const window = document.defaultView;
    const listeners = new window.AbortController();
    const query = selector => modal.querySelector(selector);
    const form = query('[data-filter-form]');
    const rows = query('[data-filter-rows]');
    const rowTemplate = query('[data-filter-row]');
    const error = query('[data-filter-error]');
    const expressionInput = query('[data-filter-expression]');
    const guidedTab = query('[data-filter-guided-tab]');
    const expressionTab = query('[data-filter-expression-tab]');
    const operatorsTab = query('[data-filter-operators-tab]');
    const clearButton = query('[data-filter-clear]');
    const applyButton = query('[data-filter-apply]');
    const initialParams = new window.URL(window.location.href).searchParams;
    const key = field => urlPrefix ? `${urlPrefix}.${field}` : field;
    let ready = false;
    let updating = false;
    let syncScheduled = false;
    let destroyed = false;
    const modalFilters = new Set();

    const labels = new Map();
    const examples = new Map();
    for (const label of query('[data-filter-operator-labels]').content.querySelectorAll('[data-operator]')) {
        for (const operator of label.dataset.operator.split(' ')) {
            labels.set(operator, label.textContent);
            if (label.dataset.exampleOperand !== undefined && smartOperators.includes(operator)) {
                examples.set(operator, operator + label.dataset.exampleOperand);
            }
        }
    }

    query('[data-filter-tabs]').hidden = !expression;

    const help = query('[data-filter-operators]');
    const copyStatus = query('[data-filter-copy-status]');
    function fillOperatorHelp() {
        const template = query('[data-filter-operator-row]');
        for (const operator of smartOperators) {
            const row = template.content.firstElementChild.cloneNode(true);
            row.querySelector('[data-filter-operator-symbol]').textContent = operator;
            row.querySelector('[data-filter-operator-description]').textContent = labels.get(operator) ?? operator;
            row.querySelector('[data-filter-operator-example]').textContent = examples.get(operator) ?? '';
            const copy = row.querySelector('[data-filter-copy]');
            copy.setAttribute('aria-label', `${copy.title} ${operator}`);
            listen(copy, 'click', async () => {
                copyStatus.textContent = '';
                try {
                    await navigator.clipboard.writeText(operator);
                    copyStatus.textContent = copyStatus.dataset.copied;
                } catch {
                    copyStatus.textContent = copyStatus.dataset.copyFailed;
                }
            });
            help.append(row);
        }
    }

    const listen = (element, event, callback) => {
        element.addEventListener(event, callback, {signal: listeners.signal});
    };
    const isManaged = filter => columns.has(filter.field) || (expression && filter.field === expressionField);

    function readTableFilters() {
        const filters = new Map();
        for (const filter of [...table.getHeaderFilters(), ...table.getFilters()]) {
            if (!isManaged(filter) || typeof filter.value !== 'string' && typeof filter.value !== 'number') {
                continue;
            }
            const value = String(filter.value);
            if (filter.field === expressionField) {
                filters.set(filter.field, {field: filter.field, type: '=', value});
                continue;
            }
            const column = columns.get(filter.field);
            if (smart) {
                filters.set(filter.field, toTableFilter({field: filter.field, ...decodeValue(column, value, true)}, true));
            } else if (column.operators.includes(filter.type)) {
                filters.set(filter.field, {field: filter.field, type: filter.type, value});
            }
        }

        return filters;
    }

    function syncUrl() {
        const url = new window.URL(window.location.href);
        for (const field of columns.keys()) {
            url.searchParams.delete(key(field));
        }
        if (expression) {
            url.searchParams.delete(key(expressionField));
        }
        for (const {field, type, value} of readTableFilters().values()) {
            if (smart || field === expressionField) {
                url.searchParams.set(key(field), value);
                continue;
            }
            const column = columns.get(field);
            const needsType = type !== column.operators[0]
                || column.longestFirst.some(operator => value.startsWith(`${operator}:`));
            url.searchParams.set(key(field), needsType ? `${type}:${value}` : value);
        }
        if (url.href !== window.location.href) {
            window.history.replaceState(window.history.state, '', url);
        }
    }

    function scheduleUrlSync() {
        if (!urlSync || !ready || updating || syncScheduled || destroyed) {
            return;
        }
        syncScheduled = true;
        window.queueMicrotask(() => {
            syncScheduled = false;
            if (!destroyed) {
                syncUrl();
            }
        });
    }

    function applyFilters(filters) {
        const currentFilters = table.getFilters();
        const currentManaged = currentFilters.filter(isManaged);
        const headerValues = new Map();
        modalFilters.clear();
        const programmatic = filters.filter(filter => {
            if (smart && filter.field !== expressionField
                && hasSmartTextHeader(table.getColumn(filter.field)?.getDefinition?.())) {
                headerValues.set(filter.field, filter.value);
                return false;
            }
            modalFilters.add(filter.field);
            return true;
        });
        updating = true;
        try {
            const sameFilters = currentManaged.length === programmatic.length
                && currentManaged.every(({field, type, value}, index) => {
                    const filter = programmatic[index];
                    return field === filter.field && type === filter.type && value === filter.value;
                });
            if (!sameFilters) {
                table.setFilter([...currentFilters.filter(filter => !isManaged(filter)), ...programmatic]);
            }
            for (const filter of table.getHeaderFilters()) {
                if (columns.has(filter.field) && !headerValues.has(filter.field)) {
                    table.setHeaderFilterValue(filter.field, '');
                }
            }
            for (const [field, value] of headerValues) {
                if (table.getHeaderFilterValue(field) !== value) {
                    table.setHeaderFilterValue(field, value);
                }
            }
        } finally {
            updating = false;
        }
    }

    function appendRow(filter = null) {
        const row = rowTemplate.content.firstElementChild.cloneNode(true);
        const field = row.querySelector('[data-filter-field]');
        const operator = row.querySelector('[data-filter-operator]');
        const value = row.querySelector('[data-filter-value]');
        for (const [name, column] of columns) {
            const label = column.label ?? table.getColumn(name)?.getDefinition?.().title ?? name;
            field.add(new window.Option(String(label), name));
        }
        if (filter) {
            field.value = filter.field;
        }

        function updateValue() {
            value.disabled = smart && noOperand.has(operator.value);
            if (value.disabled) {
                value.value = '';
            }
        }

        function updateOperators(selected = null) {
            operator.replaceChildren();
            for (const symbol of columns.get(field.value).operators) {
                operator.add(new window.Option(labels.get(symbol) ?? symbol, symbol));
            }
            if (selected !== null) {
                operator.value = selected;
            }
            updateValue();
        }

        updateOperators(filter?.operator ?? null);
        if (filter && !value.disabled) {
            value.value = filter.value;
        }
        field.addEventListener('change', () => updateOperators());
        operator.addEventListener('change', updateValue);
        row.querySelector('[data-filter-remove]').addEventListener('click', () => row.remove());
        rows.append(row);
    }

    function refreshModal() {
        const filters = readTableFilters();
        const advanced = filters.get(expressionField);
        expressionInput.value = advanced?.value ?? '';
        error.hidden = true;
        rows.replaceChildren();
        for (const [field, filter] of filters) {
            if (columns.has(field)) {
                const decoded = smart
                    ? decodeValue(columns.get(field), filter.value, true)
                    : {operator: filter.type, value: filter.value};
                appendRow({field, ...decoded});
            }
        }
        if (columns.size > 0 && !rows.firstElementChild) {
            appendRow();
        }
        if (expression && advanced) {
            expressionTab.click();
        }
    }

    function submit(event) {
        event.preventDefault();
        if (operatorsTab.classList.contains('active')) {
            return;
        }
        error.hidden = true;
        let filters = [];
        if (expression && expressionTab.classList.contains('active')) {
            const value = expressionInput.value.trim();
            if (value !== '') {
                filters.push({field: expressionField, type: '=', value});
            }
        } else {
            const seen = new Set();
            for (const row of rows.children) {
                const field = row.querySelector('[data-filter-field]').value;
                const operator = row.querySelector('[data-filter-operator]').value;
                const input = row.querySelector('[data-filter-value]');
                const value = input.disabled ? '' : input.value.trim();
                if (value === '' && !input.disabled) {
                    continue;
                }
                if (seen.has(field)) {
                    error.hidden = false;
                    return;
                }
                seen.add(field);
                filters.push(toTableFilter({field, operator, value}, smart));
            }
        }
        applyFilters(filters);
        scheduleUrlSync();
        query('[data-bs-dismiss="modal"]').click();
    }

    function onTableBuilt() {
        if (fields === undefined) {
            columns = fieldsForColumns(table.getColumns().map(column => column.getDefinition()), smart);
        }
        guidedTab.hidden = columns.size === 0;
        query('[data-filter-add]').disabled = columns.size === 0;
        if (!expression) {
            guidedTab.click();
        } else if (columns.size === 0) {
            expressionTab.click();
        }
        if (expression) {
            fillOperatorHelp();
        }
        if (urlSync) {
            const filters = readUrlFilters({columns, smart, expression, key, params: initialParams});
            if (filters.length > 0) {
                applyFilters(filters);
            }
        }
        ready = true;
    }

    function onHeaderEdit(event) {
        const header = event.target.closest?.('.tabulator-header-filter');
        if (!header || updating) {
            return;
        }
        for (const field of modalFilters) {
            if (table.getColumn(field)?.getElement?.()?.contains(header)) {
                modalFilters.delete(field);
                table.setFilter(table.getFilters().filter(filter => filter.field !== field));
                return;
            }
        }
    }

    function onTableDestroyed() {
        // Unsubscribe after Tabulator finishes dispatching the other listeners.
        window.queueMicrotask(unmount);
    }

    mountedModals.add(modal);
    table.on('tableBuilt', onTableBuilt);
    table.on('tableDestroyed', onTableDestroyed);
    if (urlSync) {
        table.on('dataFiltering', scheduleUrlSync);
    }
    listen(modal, 'show.bs.modal', refreshModal);
    listen(form, 'shown.bs.tab', event => {
        const readingOperators = event.target === operatorsTab;
        clearButton.hidden = readingOperators;
        applyButton.hidden = readingOperators;
        error.hidden = true;
    });
    for (const event of ['input', 'change', 'search']) {
        table.element.addEventListener(event, onHeaderEdit, {signal: listeners.signal, capture: true});
    }
    listen(form, 'submit', submit);
    listen(query('[data-filter-add]'), 'click', () => appendRow());
    listen(clearButton, 'click', () => {
        applyFilters([]);
        scheduleUrlSync();
        query('[data-bs-dismiss="modal"]').click();
    });

    function unmount() {
        if (!destroyed) {
            destroyed = true;
            listeners.abort();
            table.off('tableBuilt', onTableBuilt);
            table.off('tableDestroyed', onTableDestroyed);
            if (urlSync) {
                table.off('dataFiltering', scheduleUrlSync);
            }
            rows.replaceChildren();
            help.replaceChildren();
            copyStatus.textContent = '';
            mountedModals.delete(modal);
        }
    }
    return unmount;
}
