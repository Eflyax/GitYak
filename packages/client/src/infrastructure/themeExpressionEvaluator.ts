import chroma from 'chroma-js';
import type { IThemeScope } from '@/domain/models/Theme';

export function parseJsonc(raw: string): unknown {
    let result = '';
    let inString = false;
    let i = 0;

    while (i < raw.length) {
        const ch = raw[i];
        const next = raw[i + 1];

        if (inString) {
            result += ch;
            if (ch === '\\') {
                result += raw[i + 1] ?? '';
                i += 2;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            i++;
            continue;
        }

        if (ch === '"') {
            inString = true;
            result += ch;
            i++;
            continue;
        }

        if (ch === '/' && next === '/') {
            while (i < raw.length && raw[i] !== '\n') {
                i++;
            }
            continue;
        }

        result += ch;
        i++;
    }

    return JSON.parse(result);
}

function splitArgs(argsStr: string): Array<string> {
    const parts: Array<string> = [];
    let depth = 0;
    let current = '';

    for (const ch of argsStr) {
        if (ch === '(' ) {
            depth++;
            current += ch;
        } else if (ch === ')') {
            depth--;
            current += ch;
        } else if (ch === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim()) {
        parts.push(current.trim());
    }

    return parts;
}

function resolveArg(arg: string, resolved: Record<string, string>): string {
    return resolveExpression(arg, resolved);
}

function parsePercent(value: string): number {
    return parseFloat(value.replace('%', '')) / 100;
}

function resolveExpression(expr: string, resolved: Record<string, string>): string {
    const trimmed = expr.trim();

    if (!trimmed) {
        return trimmed;
    }

    if (trimmed.startsWith('#') || trimmed.startsWith('rgb')) {
        return trimmed;
    }

    if (trimmed.startsWith('var(--')) {
        return trimmed;
    }

    if (trimmed.startsWith('@')) {
        const key = trimmed.slice(1);
        return resolved[key] ?? trimmed;
    }

    const parenIdx = trimmed.indexOf('(');

    if (parenIdx === -1) {
        return trimmed;
    }

    const fn = trimmed.slice(0, parenIdx).trim();
    const argsStr = trimmed.slice(parenIdx + 1, trimmed.lastIndexOf(')'));
    const args = splitArgs(argsStr).map(a => resolveArg(a, resolved));

    if (fn === 'rgba') {
        return `rgba(${args.join(', ')})`;
    }

    if (fn === 'lighten' && args.length === 2) {
        const amount = parsePercent(args[1]);
        try {
            const c = chroma(args[0]);
            const l = c.get('hsl.l');
            return c.set('hsl.l', Math.min(1, l + amount)).hex();
        } catch {
            return args[0];
        }
    }

    if (fn === 'darken' && args.length === 2) {
        const amount = parsePercent(args[1]);
        try {
            const c = chroma(args[0]);
            const l = c.get('hsl.l');
            return c.set('hsl.l', Math.max(0, l - amount)).hex();
        } catch {
            return args[0];
        }
    }

    if (fn === 'fade' && args.length === 2) {
        const alpha = parsePercent(args[1]);
        try {
            return chroma(args[0]).alpha(alpha).css();
        } catch {
            return args[0];
        }
    }

    if (fn === 'mixLess' && args.length === 3) {
        const weight = parsePercent(args[2]);
        try {
            return chroma.mix(args[0], args[1], weight, 'hsl').hex();
        } catch {
            return args[0];
        }
    }

    return trimmed;
}

function buildDependencies(tokens: Record<string, string>): Map<string, Array<string>> {
    const deps = new Map<string, Array<string>>();

    for (const [key, value] of Object.entries(tokens)) {
        const references: Array<string> = [];
        const refMatches = value.matchAll(/@([\w.\-]+)/g);

        for (const match of refMatches) {
            references.push(match[1]);
        }

        deps.set(key, references);
    }

    return deps;
}

function topologicalSort(
    tokens: Record<string, string>,
    _inherited: Record<string, string>
): Array<string> {
    const deps = buildDependencies(tokens);
    const sorted: Array<string> = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function visit(key: string): void {
        if (visited.has(key) || !(key in tokens)) {
            return;
        }

        if (inStack.has(key)) {
            return;
        }

        inStack.add(key);

        for (const dep of deps.get(key) ?? []) {
            if (dep in tokens && !visited.has(dep)) {
                visit(dep);
            }
        }

        inStack.delete(key);
        visited.add(key);
        sorted.push(key);
    }

    for (const key of Object.keys(tokens)) {
        visit(key);
    }

    return sorted;
}

export function resolveScope(
    scope: IThemeScope,
    inherited: Record<string, string> = {}
): Record<string, string> {
    const resolved: Record<string, string> = { ...inherited };
    const order = topologicalSort(scope, inherited);

    for (const key of order) {
        const expr = scope[key];
        if (expr !== undefined) {
            resolved[key] = resolveExpression(expr, resolved);
        }
    }

    return resolved;
}
