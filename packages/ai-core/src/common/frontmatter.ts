// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { dump, load } from 'js-yaml';

/**
 * Result of parsing a frontmatter document. When the input has no frontmatter
 * (or it is invalid), `metadata` is `undefined` and `body` is the original content.
 */
export interface FrontmatterParseResult<T> {
    metadata: T | undefined;
    body: string;
}

export interface FrontmatterParseOptions<T> {
    /**
     * Optional type guard used to validate the parsed YAML object. When the guard
     * returns `false`, the parser falls back to returning `metadata: undefined`.
     */
    isValid?: (metadata: unknown) => metadata is T;
}

const STANDARD_FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

/**
 * Parse a string containing optional YAML frontmatter.
 *
 * Supports two layouts (in this order):
 *   1. Standard: starts with `---`, YAML, then `---` separator, then body.
 *   2. Legacy:   starts directly with YAML, then `---` separator, then body.
 *
 * The legacy form is preserved so existing on-disk files written by older
 * Theia versions (e.g. task-context summaries) continue to parse without a
 * migration step.
 */
export function parseFrontmatter<T = unknown>(content: string, options?: FrontmatterParseOptions<T>): FrontmatterParseResult<T> {
    const standardMatch = content.match(STANDARD_FRONTMATTER_REGEX);
    if (standardMatch) {
        const parsed = tryLoad(standardMatch[1]);
        if (parsed !== undefined && isAcceptable(parsed, options)) {
            return { metadata: parsed as T, body: standardMatch[2].trim() };
        }
    }

    const separatorIndex = content.indexOf('\n---');
    if (separatorIndex > 0) {
        const head = content.slice(0, separatorIndex);
        const tail = content.slice(separatorIndex + 4);
        const parsed = tryLoad(head);
        if (parsed !== undefined && isAcceptable(parsed, options)) {
            return { metadata: parsed as T, body: tail.replace(/^\s*\n?/, '').trim() };
        }
    }

    return { metadata: undefined, body: content };
}

/**
 * Serialize metadata + body into a standard frontmatter document
 * (`---\n<yaml>\n---\n<body>`).
 */
export function serializeFrontmatter(metadata: Record<string, unknown>, body: string): string {
    const yamlBlock = dump(metadata, { lineWidth: -1 }).trimEnd();
    const trimmedBody = body.replace(/^\n+/, '');
    return `---\n${yamlBlock}\n---\n${trimmedBody}`;
}

function tryLoad(source: string): unknown {
    try {
        const parsed = load(source);
        // eslint-disable-next-line no-null/no-null
        if (parsed === undefined || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

function isAcceptable<T>(parsed: unknown, options?: FrontmatterParseOptions<T>): boolean {
    if (!options?.isValid) {
        return true;
    }
    return options.isValid(parsed);
}
