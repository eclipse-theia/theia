// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { DisposableCollection, Emitter, Event, nls, URI } from '@theia/core';
import { FrontendApplicationContribution, QuickInputService } from '@theia/core/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import {
    ToolInvocationRegistry,
    ToolRequest,
    ToolRequestParameters,
    ToolRequestParameterProperty
} from '@theia/ai-core';
import { dump, load } from 'js-yaml';
import {
    SketchedToolDefinition,
    SketchedToolParameterDefinition,
    SketchedToolService,
    SKETCHED_TOOLS_PROVIDER_NAME
} from '../common';

const SKETCHED_TOOLS_FILENAME = 'sketchedTools.yml';

@injectable()
export class SketchedToolServiceImpl implements SketchedToolService, FrontendApplicationContribution {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    protected tools: SketchedToolDefinition[] = [];
    protected fileUri: URI | undefined;
    protected readonly toDispose = new DisposableCollection();
    protected loading = false;

    protected readonly onDidChangeSketchedToolsEmitter = new Emitter<void>();
    readonly onDidChangeSketchedTools: Event<void> = this.onDidChangeSketchedToolsEmitter.event;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onDidChangeSketchedToolsEmitter);
    }

    async onStart(): Promise<void> {
        this.fileUri = await this.resolveFileUri();
        await this.loadFromDisk();
        this.watchFile();
    }

    getSketchedTools(): SketchedToolDefinition[] {
        return [...this.tools];
    }

    async addSketchedTool(tool: SketchedToolDefinition): Promise<void> {
        this.tools.push(tool);
        this.registerAllTools();
        await this.persistToDisk();
        this.onDidChangeSketchedToolsEmitter.fire();
    }

    async updateSketchedTool(tool: SketchedToolDefinition): Promise<void> {
        const index = this.tools.findIndex(t => t.id === tool.id);
        if (index >= 0) {
            this.tools[index] = tool;
        } else {
            this.tools.push(tool);
        }
        this.registerAllTools();
        await this.persistToDisk();
        this.onDidChangeSketchedToolsEmitter.fire();
    }

    async removeSketchedTool(toolId: string): Promise<void> {
        this.tools = this.tools.filter(t => t.id !== toolId);
        this.registerAllTools();
        await this.persistToDisk();
        this.onDidChangeSketchedToolsEmitter.fire();
    }

    protected async resolveFileUri(): Promise<URI> {
        const configDirUri = await this.envVariablesServer.getConfigDirUri();
        return new URI(configDirUri).resolve('prompt-templates').resolve(SKETCHED_TOOLS_FILENAME);
    }

    protected async loadFromDisk(): Promise<void> {
        if (!this.fileUri) {
            return;
        }
        this.loading = true;
        try {
            const exists = await this.fileService.exists(this.fileUri);
            if (!exists) {
                this.tools = [];
                this.registerAllTools();
                return;
            }
            const fileContent = await this.fileService.read(this.fileUri, { encoding: 'utf-8' });
            const doc = load(fileContent.value);
            if (Array.isArray(doc) && doc.every(entry => SketchedToolDefinition.is(entry))) {
                this.tools = (doc as SketchedToolDefinition[]).map(SketchedToolDefinition.normalize);
            } else {
                console.debug('Invalid sketchedTools.yml content, ignoring.');
                this.tools = [];
            }
            this.registerAllTools();
            this.onDidChangeSketchedToolsEmitter.fire();
        } catch (e) {
            console.debug(`Error loading ${SKETCHED_TOOLS_FILENAME}: ${e.message}`, e);
        } finally {
            this.loading = false;
        }
    }

    onStop(): void {
        this.toDispose.dispose();
    }

    protected async persistToDisk(): Promise<void> {
        if (!this.fileUri) {
            return;
        }
        try {
            const yamlContent = dump(this.tools, { lineWidth: -1 });
            const buffer = BinaryBuffer.fromString(yamlContent);
            if (await this.fileService.exists(this.fileUri)) {
                await this.fileService.writeFile(this.fileUri, buffer);
            } else {
                await this.fileService.createFile(this.fileUri, buffer);
            }
        } catch (e) {
            console.error(`Error persisting ${SKETCHED_TOOLS_FILENAME}: ${e.message}`, e);
        }
    }

    protected watchFile(): void {
        if (!this.fileUri) {
            return;
        }
        const parentUri = this.fileUri.parent;
        this.toDispose.push(this.fileService.watch(parentUri));
        const listener = this.fileService.onDidFilesChange((event: FileChangesEvent) => {
            if (this.fileUri && event.contains(this.fileUri) && !this.loading) {
                this.loadFromDisk();
            }
        });
        this.toDispose.push(listener);
    }

    protected registerAllTools(): void {
        this.toolInvocationRegistry.unregisterAllTools(SKETCHED_TOOLS_PROVIDER_NAME);
        for (const def of this.tools) {
            const toolRequest = this.toToolRequest(def);
            this.toolInvocationRegistry.registerTool(toolRequest);
        }
    }

    protected toToolRequest(def: SketchedToolDefinition): ToolRequest {
        const parameters = this.convertParameters(def.parameters);
        return {
            id: def.id,
            name: def.name,
            description: def.description,
            providerName: SKETCHED_TOOLS_PROVIDER_NAME,
            parameters,
            handler: async (argString: string) => {
                if (def.returnMode === 'askAtRuntime') {
                    return this.askUserForReturnValue(def.name, argString);
                }
                return def.staticReturn;
            }
        };
    }

    protected async askUserForReturnValue(toolName: string, argString: string): Promise<string> {
        const result = await this.quickInputService.input({
            prompt: nls.localize('theia/ai-tool-sketchpad/askReturnPrompt',
                'Tool "{0}" was called with: {1}', toolName, argString),
            placeHolder: nls.localize('theia/ai-tool-sketchpad/askReturnPlaceholder',
                'Enter the return value for this tool call...')
        });
        return result ?? '';
    }

    protected convertParameters(params: SketchedToolParameterDefinition[]): ToolRequestParameters {
        const properties: Record<string, ToolRequestParameterProperty> = {};
        const required: string[] = [];

        for (const param of params) {
            properties[param.name] = this.convertParameterProperty(param);
            if (param.required) {
                required.push(param.name);
            }
        }

        return {
            type: 'object',
            properties,
            ...(required.length > 0 ? { required } : {})
        };
    }

    protected convertParameterProperty(param: SketchedToolParameterDefinition): ToolRequestParameterProperty {
        const prop: ToolRequestParameterProperty = {
            type: param.type,
            description: param.description
        };

        if (param.type === 'object' && param.properties && param.properties.length > 0) {
            const nested = this.convertParameters(param.properties);
            prop.properties = nested.properties;
            if (nested.required && nested.required.length > 0) {
                prop.required = nested.required;
            }
        }

        if (param.type === 'array' && param.itemType) {
            if (param.itemType === 'object' && param.itemProperties && param.itemProperties.length > 0) {
                const nested = this.convertParameters(param.itemProperties);
                prop.items = {
                    type: 'object',
                    properties: nested.properties,
                    ...(nested.required && nested.required.length > 0 ? { required: nested.required } : {})
                };
            } else {
                prop.items = { type: param.itemType };
            }
        }

        return prop;
    }
}
