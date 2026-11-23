export const nativeOperators = ['=', '!=', '<', '<=', '>', '>=', 'like', 'keywords', 'starts', 'ends'];
export const smartOperators = [
    '=', '!=', '<', '<=', '>', '>=', '~~', '!~~', '^', '!^', '$', '!$',
    'in:', 'notin:', 'between:', 'notbetween:', 'is:null', 'isnot:null',
];

export function smartOperand(value, operators) {
    let operator = '';
    for (const symbol of operators) {
        if (symbol.length > operator.length && value.startsWith(symbol)) {
            operator = symbol;
        }
    }
    if (operator) {
        return {operator, value: value.slice(operator.length)};
    }

    return {operator: operators.includes('~~') ? '~~' : operators[0], value};
}

export function hasSmartTextHeader(definition) {
    return definition?.headerFilter === 'input'
        && (!definition.headerFilterFunc || ['=', 'like'].includes(definition.headerFilterFunc));
}
