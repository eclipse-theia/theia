// *****************************************************************************
// Copyright (C) 2026 EclipseSource
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

import { interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../../common/rpc-protocol';
import {
    LanguageModelToolsMain,
    LanguageModelToolsExt,
    LanguageModelToolDto,
    isToolInvocationError,
} from '../../common/lm-tool-protocol';
import { MAIN_RPC_CONTEXT } from '../../common/plugin-api-rpc';
import { ToolInvocationRegistry } from '@theia/ai-core/lib/common';
import { ToolRequest, ToolRequestParameters, createToolCallError } from '@theia/ai-core/lib/common/language-model';

export class LanguageModelToolsMainImpl implements LanguageModelToolsMain {
    private readonly proxy: LanguageModelToolsExt;
    private readonly toolInvocationRegistry: ToolInvocationRegistry | undefined;
    private readonly toolHandleToName = new Map<number, string>();

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.LM_TOOLS_EXT);
        try {
            this.toolInvocationRegistry = container.get(ToolInvocationRegistry);
        } catch {
            this.toolInvocationRegistry = undefined;
        }
    }

    $registerTool(handle: number, name: string, metadata: LanguageModelToolDto): void {
        if (!this.toolInvocationRegistry) {
            console.warn('ToolInvocationRegistry not available - tool will not be registered');
            return;
        }
        const self = this;
        const parameters: ToolRequestParameters = ToolRequest.isToolRequestParameters(metadata.inputSchema) ? {
            type: (metadata.inputSchema as ToolRequestParameters).type,
            properties: (metadata.inputSchema as ToolRequestParameters).properties,
            required: (metadata.inputSchema as ToolRequestParameters).required
        } : {
            type: 'object',
            properties: {}
        };
        const toolRequest: ToolRequest = {
            id: name,
            name: name,
            providerName: 'plugin_lm_tools',
            description: metadata.description,
            parameters,
            handler: async (argString: string) => {
                const result = await self.proxy.$invokeTool(handle, argString);
                if (isToolInvocationError(result)) {
                    return createToolCallError(result.error);
                }
                const parts: string[] = [];
                for (const part of result.content) {
                    if (part && typeof part === 'object' && 'value' in part && typeof (part as { value: unknown }).value === 'string') {
                        parts.push((part as { value: string }).value);
                    } else {
                        parts.push(JSON.stringify(part));
                    }
                }
                return parts.join('\n');
            }
        };
        this.toolHandleToName.set(handle, name);
        this.toolInvocationRegistry.registerTool(toolRequest);
    }

    $unregisterTool(handle: number): void {
        if (!this.toolInvocationRegistry) {
            return;
        }
        const name = this.toolHandleToName.get(handle);
        if (name) {
            this.toolInvocationRegistry.unregisterTool(name);
            this.toolHandleToName.delete(handle);
        }
    }
}
