// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';

const SHORT_VALUE_THRESHOLD = 30;

export function formatArgsForTooltip(args: string): MarkdownStringImpl {
    const md = new MarkdownStringImpl();
    let parsed: unknown;
    try {
        parsed = JSON.parse(args);
    } catch {
        md.appendCodeblock('', args);
        return md;
    }
    if (typeof parsed !== 'object' || !parsed || Array.isArray(parsed)) {
        const serialized = JSON.stringify(parsed, undefined, 2);
        md.appendCodeblock('', serialized);
        return md;
    }
    const entries = Object.entries(parsed as Record<string, unknown>);
    for (const [key, value] of entries) {
        if (typeof value === 'string') {
            if (value.length <= SHORT_VALUE_THRESHOLD) {
                md.appendMarkdown(`**${key}:** ${escapeMarkdown(value)}\n\n`);
            } else {
                md.appendMarkdown(`**${key}:**\n`);
                md.appendCodeblock('', value);
            }
        } else {
            md.appendMarkdown(`**${key}:**\n`);
            md.appendCodeblock('', JSON.stringify(value, undefined, 2));
        }
    }
    return md;
}

function escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_{}[\]()#+\-!|>~]/g, '\\$&');
}

export function condenseArguments(args: string): string | undefined {
    if (!args || !args.trim() || args.trim() === '{}') {
        return undefined;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(args);
    } catch {
        return args.length > 80 ? args.substring(0, 80) + '\u2026' : args;
    }
    if (typeof parsed !== 'object' || !parsed || Array.isArray(parsed)) {
        const str = JSON.stringify(parsed);
        return str.length > 80 ? str.substring(0, 80) + '\u2026' : str;
    }
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
        return undefined;
    }
    const formatValue = (value: unknown): string => {
        if (typeof value === 'string') {
            return value.length > 30 ? value.substring(0, 30) + '\u2026' : value;
        } else if (Array.isArray(value)) {
            return '[\u2026]';
        } else if (typeof value === 'object' && !!value) {
            return '{\u2026}';
        } else {
            return String(value);
        }
    };
    if (entries.length === 1) {
        const result = formatValue(entries[0][1]);
        return result.length > 80 ? result.substring(0, 80) + '\u2026' : result;
    }
    const parts = entries.map(([key, value]) => `${key}: ${formatValue(value)}`);
    const joined = parts.join(', ');
    return joined.length > 80 ? joined.substring(0, 80) + '\u2026' : joined;
}
