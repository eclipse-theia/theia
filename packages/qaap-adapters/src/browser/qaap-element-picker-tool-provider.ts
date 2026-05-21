// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { QaapElementPickerService } from './qaap-element-picker-service';
import { QAAP_PICK_ELEMENT_TOOL_ID } from './qaap-element-picker-tools-common';

@injectable()
export class QaapPickElementTool implements ToolProvider {

    @inject(QaapElementPickerService)
    protected readonly picker: QaapElementPickerService;

    getTool(): ToolRequest {
        return {
            id: QAAP_PICK_ELEMENT_TOOL_ID,
            name: QAAP_PICK_ELEMENT_TOOL_ID,
            providerName: 'qaap',
            description: 'Activates the DOM element picker in the in-IDE dev preview. The user clicks an element; '
                + 'returns domPath, tag, and outerHTML. Open preview first (qaap_bootstrap_open_preview).',
            parameters: {
                type: 'object',
                properties: {
                    timeoutMs: {
                        type: 'number',
                        description: 'Max wait for user pick in milliseconds (default 120000).',
                    },
                },
            },
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                let timeoutMs: number | undefined;
                if (args.trim().length > 0) {
                    try {
                        const parsed = JSON.parse(args) as { timeoutMs?: number };
                        if (typeof parsed.timeoutMs === 'number' && parsed.timeoutMs > 0) {
                            timeoutMs = parsed.timeoutMs;
                        }
                    } catch (e) {
                        return JSON.stringify({ error: `Invalid arguments for ${QAAP_PICK_ELEMENT_TOOL_ID}: ${e}` });
                    }
                }
                const result = await this.picker.pickElement(timeoutMs);
                return JSON.stringify(result);
            },
        };
    }
}
