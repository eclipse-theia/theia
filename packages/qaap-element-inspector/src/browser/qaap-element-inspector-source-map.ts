// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { PickedElement } from './element-inspector-types';

export interface QaapElementSourceLocation {
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
}

const SOURCE_ATTRS = [
    'data-source',
    'data-source-file',
    'data-file',
    'data-loc',
    'data-line',
    'data-component-file',
] as const;

/**
 * Best-effort mapping from a picked DOM node to a workspace source file (Q1 heuristic).
 * Prefer explicit `data-*` attributes from dev tooling; no real source-map fetch yet.
 */
export function guessSourceLocationFromElement(picked: PickedElement): QaapElementSourceLocation | undefined {
    for (const name of SOURCE_ATTRS) {
        const attr = picked.attributes.find(a => a.name === name);
        if (!attr?.value) {
            continue;
        }
        const parsed = parseSourceAttribute(attr.value);
        if (parsed?.file) {
            return parsed;
        }
    }
    const component = picked.attributes.find(a => a.name === 'data-component')?.value;
    if (component) {
        const normalized = component.replace(/^@/, '').replace(/\\/g, '/');
        if (normalized.includes('/')) {
            return { file: normalized.startsWith('src/') ? normalized : `src/${normalized}` };
        }
        return { file: `src/components/${normalized}.tsx` };
    }
    return undefined;
}

function parseSourceAttribute(raw: string): QaapElementSourceLocation | undefined {
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    // `path/to/File.tsx:12:3` or `path/to/File.tsx:12`
    const colonMatch = trimmed.match(/^(.+?):(\d+)(?::(\d+))?$/);
    if (colonMatch) {
        return {
            file: colonMatch[1],
            line: Number(colonMatch[2]),
            column: colonMatch[3] !== undefined ? Number(colonMatch[3]) : undefined,
        };
    }
    // `12:3` with separate data-file
    if (/^\d+(:\d+)?$/.test(trimmed)) {
        const [line, column] = trimmed.split(':').map(Number);
        return { line, column: column || undefined };
    }
    return { file: trimmed.replace(/\\/g, '/') };
}
