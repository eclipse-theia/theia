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
