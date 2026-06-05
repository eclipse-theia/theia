// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ToolCallResult } from '@theia/ai-core';

export function formatToolResult(result: ToolCallResult | undefined): string | undefined {
    if (result === undefined || result === '') {
        return undefined;
    }
    if (typeof result === 'string') {
        return result.trim() || undefined;
    }
    try {
        return JSON.stringify(result, undefined, 2);
    } catch {
        return String(result);
    }
}

/** Fields that, when present, best summarize a tool call in a single line. */
const TOOL_SUMMARY_FIELDS = ['command', 'path', 'file_path', 'filePath', 'pattern', 'query', 'url', 'description', 'prompt'];

/**
 * Produce a compact one-line summary of a tool's JSON arguments so the collapsed
 * header can show context (e.g. the path being read) instead of just the tool name.
 * Returns `undefined` when there is nothing meaningful to show.
 */
export function summarizeToolArguments(args: string | undefined): string | undefined {
    const trimmed = args?.trim();
    if (!trimmed || trimmed === '{}') {
        return undefined;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return collapseWhitespace(trimmed);
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        for (const key of TOOL_SUMMARY_FIELDS) {
            const value = record[key];
            if (typeof value === 'string' && value.trim()) {
                return collapseWhitespace(value);
            }
        }
        const keys = Object.keys(record);
        if (keys.length > 0) {
            return keys.join(', ');
        }
    }
    return collapseWhitespace(trimmed);
}

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}
