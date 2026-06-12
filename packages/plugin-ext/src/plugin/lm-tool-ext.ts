// *****************************************************************************
// Copyright (C) 2026 EclipseSource.
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

import type * as theia from '@theia/plugin';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { Disposable } from '@theia/core/lib/common/disposable';
import { RPCProtocol } from '../common/rpc-protocol';
import {
    LanguageModelToolsExt,
    LanguageModelToolsMain,
    LanguageModelToolDto,
    ToolInvocationResult,
    ToolResultPartDto,
    isToolInvocationError,
} from '../common/lm-tool-protocol';
import { PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { PluginPackageLanguageModelToolContribution } from '../common';
import { PluginLogger } from './logger';

export class LanguageModelToolsExtImpl implements LanguageModelToolsExt {

    private proxy: LanguageModelToolsMain;
    private logger: PluginLogger;
    private handleCounter = 0;
    private readonly tools = new Map<number, theia.LanguageModelTool<unknown>>();
    private readonly toolNameToHandle = new Map<string, number>();
    private readonly toolContributions = new Map<string, PluginPackageLanguageModelToolContribution>();
    private readonly registeredToolMetadata = new Map<number, LanguageModelToolDto>();

    constructor(protected readonly rpc: RPCProtocol) {
        this.proxy = this.rpc.getProxy(PLUGIN_RPC_CONTEXT.LM_TOOLS_MAIN);
        this.logger = new PluginLogger(this.rpc, 'lm-tools');
    }

    registerToolContributions(contributions: PluginPackageLanguageModelToolContribution[]): void {
        for (const contribution of contributions) {
            this.toolContributions.set(contribution.name, contribution);
        }
    }

    registerTool<T>(name: string, tool: theia.LanguageModelTool<T>, pluginId: string): theia.Disposable {
        const contribution = this.toolContributions.get(name);
        if (!contribution) {
            this.logger.warn(`Tool '${name}' is not declared in package.json contributes.languageModelTools.`);
        }
        const handle = this.handleCounter++;
        this.tools.set(handle, tool);
        this.toolNameToHandle.set(name, handle);

        const metadata: LanguageModelToolDto = {
            name,
            description: contribution?.description,
            inputSchema: contribution?.inputSchema,
            tags: contribution?.tags,
        };
        this.registeredToolMetadata.set(handle, metadata);
        this.proxy.$registerTool(handle, name, metadata, pluginId);

        return Disposable.create(() => {
            this.tools.delete(handle);
            this.toolNameToHandle.delete(name);
            this.registeredToolMetadata.delete(handle);
            this.proxy.$unregisterTool(handle);
        });
    }

    async invokeTool(name: string, options: theia.LanguageModelToolInvocationOptions<object>, token?: CancellationToken): Promise<theia.LanguageModelToolResult> {
        const handle = this.toolNameToHandle.get(name);
        if (handle === undefined) {
            throw new Error(`Tool '${name}' is not registered.`);
        }
        const result = await this.$invokeTool(handle, JSON.stringify(options.input), token);
        if (isToolInvocationError(result)) {
            throw new Error(result.error);
        }
        return result as unknown as theia.LanguageModelToolResult;
    }

    getTools(): theia.LanguageModelToolInformation[] {
        const result = new Map<string, theia.LanguageModelToolInformation>();
        // Add declared tool contributions from package.json
        for (const c of this.toolContributions.values()) {
            result.set(c.name, {
                name: c.name,
                description: c.description ?? '',
                inputSchema: c.inputSchema,
                tags: c.tags ?? [],
            });
        }
        // Add dynamically registered tools not already covered by declarations
        for (const [name, handle] of this.toolNameToHandle.entries()) {
            if (!result.has(name)) {
                const metadata = this.registeredToolMetadata.get(handle);
                if (metadata) {
                    result.set(name, {
                        name: metadata.name,
                        description: metadata.description ?? '',
                        inputSchema: metadata.inputSchema,
                        tags: metadata.tags ?? [],
                    });
                }
            }
        }
        return [...result.values()];
    }

    async $invokeTool(handle: number, argsString: string, token?: CancellationToken): Promise<ToolInvocationResult> {
        const tool = this.tools.get(handle);
        if (!tool) {
            return { error: `Tool with handle ${handle} not found` };
        }
        try {
            const input = argsString ? JSON.parse(argsString) : {};
            const cancellationToken = token ?? CancellationToken.None;
            const result = await tool.invoke(
                { input, toolInvocationToken: undefined },
                cancellationToken
            );
            if (!result) {
                return { content: [] };
            }
            return { content: result.content.map(part => this.convertPartToDto(part)) };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { error: errorMessage };
        }
    }

    private convertPartToDto(part: unknown): ToolResultPartDto {
        if (this.isTextPart(part)) {
            return { type: 'text', value: part.value };
        }
        if (this.isDataPart(part)) {
            const base64 = this.uint8ArrayToBase64(part.data);
            return { type: 'data', base64, mimeType: part.mimeType };
        }
        if (this.isPromptTsxPart(part)) {
            return { type: 'prompt-tsx', value: part.value };
        }
        return { type: 'unknown', json: JSON.stringify(part) };
    }

    private isTextPart(part: unknown): part is { value: string } {
        return typeof part === 'object' && part !== undefined
            && 'value' in (part as object) && typeof (part as { value: unknown }).value === 'string'
            && !('data' in (part as object)) && !('mimeType' in (part as object));
    }

    private isDataPart(part: unknown): part is { data: Uint8Array; mimeType: string } {
        return typeof part === 'object' && part !== undefined
            && 'data' in (part as object) && 'mimeType' in (part as object)
            && typeof (part as { mimeType: unknown }).mimeType === 'string';
    }

    private isPromptTsxPart(part: unknown): part is { value: unknown } {
        return typeof part === 'object' && part !== undefined
            && 'value' in (part as object) && typeof (part as { value: unknown }).value !== 'string'
            && !('data' in (part as object)) && !('mimeType' in (part as object));
    }

    private uint8ArrayToBase64(data: Uint8Array): string {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(data).toString('base64');
        }
        // Fallback for browser environments
        let binary = '';
        for (let i = 0; i < data.byteLength; i++) {
            binary += String.fromCharCode(data[i]);
        }
        return btoa(binary);
    }
}
