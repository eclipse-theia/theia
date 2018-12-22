/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import debounce = require('p-debounce');
import { visit } from 'jsonc-parser';
import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Event, Emitter, ResourceProvider } from '@theia/core';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { QuickPickService, StorageService } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { DebugConfiguration } from '../common/debug-configuration';
import { DebugConfigurationModel } from './debug-configuration-model';
import { DebugSessionOptions } from './debug-session-options';
import { DebugService } from '../common/debug-service';

@injectable()
export class DebugConfigurationManager {

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(EditorManager)
    protected readonly editorManager: EditorManager;
    @inject(DebugService)
    protected readonly debug: DebugService;
    @inject(QuickPickService)
    protected readonly quickPick: QuickPickService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected initialized: Promise<void>;
    @postConstruct()
    protected async init(): Promise<void> {
        this.initialized = this.updateModels();
        this.workspaceService.onWorkspaceChanged(() => this.updateModels());
    }

    protected readonly models = new Map<string, DebugConfigurationModel>();
    protected updateModels = debounce(async () => {
        const roots = await this.workspaceService.roots;
        const toDelete = new Set(this.models.keys());
        for (const rootStat of roots) {
            const root = new URI(rootStat.uri);
            for (const [provider, configPath] of [['theia', '.theia/launch.json'], ['vscode', '.vscode/launch.json']]) {
                const uri = root.resolve(configPath);
                const key = uri.toString();
                toDelete.delete(key);
                if (!this.models.has(key)) {
                    const resource = await this.resourceProvider(uri);
                    const model = new DebugConfigurationModel(provider, rootStat.uri, resource);
                    await model.reconcile();
                    model.onDidChange(() => this.updateCurrent());
                    model.onDispose(() => this.models.delete(key));
                    this.models.set(key, model);
                }
            }
        }
        for (const uri of toDelete) {
            const model = this.models.get(uri);
            if (model) {
                model.dispose();
            }
        }
        this.updateCurrent();
    }, 500);

    get all(): IterableIterator<DebugSessionOptions> {
        return this.getAll();
    }
    protected *getAll(): IterableIterator<DebugSessionOptions> {
        for (const model of this.models.values()) {
            for (const configuration of model.configurations) {
                yield {
                    configuration,
                    workspaceFolderUri: model.workspaceFolderUri
                };
            }
        }
    }

    get supported(): Promise<IterableIterator<DebugSessionOptions>> {
        return this.getSupported();
    }
    protected async getSupported(): Promise<IterableIterator<DebugSessionOptions>> {
        const [, debugTypes] = await Promise.all([await this.initialized, this.debug.debugTypes()]);
        return this.doGetSupported(new Set(debugTypes));
    }
    protected *doGetSupported(debugTypes: Set<string>): IterableIterator<DebugSessionOptions> {
        for (const options of this.getAll()) {
            if (debugTypes.has(options.configuration.type)) {
                yield options;
            }
        }
    }

    protected _currentOptions: DebugSessionOptions | undefined;
    get current(): DebugSessionOptions | undefined {
        return this._currentOptions;
    }
    set current(option: DebugSessionOptions | undefined) {
        this.updateCurrent(option);
    }
    protected updateCurrent(options: DebugSessionOptions | undefined = this._currentOptions): void {
        this._currentOptions = options
            && this.find(options.configuration.name, options.workspaceFolderUri);
        if (!this._currentOptions) {
            const { model } = this;
            if (model) {
                const configuration = model.configurations[0];
                if (configuration) {
                    this._currentOptions = {
                        configuration,
                        workspaceFolderUri: model.workspaceFolderUri
                    };
                }
            }
        }
        this.onDidChangeEmitter.fire(undefined);
    }
    find(name: string, workspaceFolderUri: string | undefined): DebugSessionOptions | undefined {
        for (const model of this.models.values()) {
            if (model.workspaceFolderUri === workspaceFolderUri) {
                for (const configuration of model.configurations) {
                    if (configuration.name === name) {
                        return {
                            configuration,
                            workspaceFolderUri
                        };
                    }
                }
            }
        }
        return undefined;
    }

    async openConfiguration(): Promise<void> {
        const { model } = this;
        if (model) {
            await this.doOpen(model);
        }
    }
    async addConfiguration(): Promise<void> {
        const { model } = this;
        if (!model) {
            return;
        }
        const widget = await this.doOpen(model);
        if (!(widget.editor instanceof MonacoEditor)) {
            return;
        }
        const editor = widget.editor.getControl();
        const { commandService } = widget.editor;
        let position: monaco.Position | undefined;
        let depthInArray = 0;
        let lastProperty = '';
        visit(editor.getValue(), {
            onObjectProperty: property => {
                lastProperty = property;
            },
            onArrayBegin: offset => {
                if (lastProperty === 'configurations' && depthInArray === 0) {
                    position = editor.getModel().getPositionAt(offset + 1);
                }
                depthInArray++;
            },
            onArrayEnd: () => {
                depthInArray--;
            }
        });
        if (!position) {
            return;
        }
        // Check if there are more characters on a line after a "configurations": [, if yes enter a newline
        if (editor.getModel().getLineLastNonWhitespaceColumn(position.lineNumber) > position.column) {
            editor.setPosition(position);
            editor.trigger('debug', 'lineBreakInsert', undefined);
        }
        // Check if there is already an empty line to insert suggest, if yes just place the cursor
        if (editor.getModel().getLineLastNonWhitespaceColumn(position.lineNumber + 1) === 0) {
            editor.setPosition({ lineNumber: position.lineNumber + 1, column: 1 << 30 });
            await commandService.executeCommand('editor.action.deleteLines');
        }
        editor.setPosition(position);
        await commandService.executeCommand('editor.action.insertLineAfter');
        await commandService.executeCommand('editor.action.triggerSuggest');
    }

    protected get model(): DebugConfigurationModel | undefined {
        for (const model of this.models.values()) {
            if (model.exists) {
                return model;
            }
        }
        for (const model of this.models.values()) {
            if (model.provider === 'theia') {
                return model;
            }
        }
        return this.models.values().next().value;
    }

    protected async doOpen(model: DebugConfigurationModel): Promise<EditorWidget> {
        if (!model.exists) {
            await this.doCreate(model);
        }
        return this.editorManager.open(model.uri, {
            mode: 'activate'
        });
    }
    protected async doCreate(model: DebugConfigurationModel): Promise<void> {
        const debugType = await this.selectDebugType();
        const configurations = debugType ? await this.debug.provideDebugConfigurations(debugType, model.workspaceFolderUri) : [];
        const content = this.getInitialConfigurationContent(configurations);
        await model.save(content);
    }

    protected getInitialConfigurationContent(initialConfigurations: DebugConfiguration[]): string {
        return `{
  // Use IntelliSense to learn about possible attributes.
  // Hover to view descriptions of existing attributes.
  "version": "0.2.0",
  "configurations": ${JSON.stringify(initialConfigurations, undefined, '  ').split('\n').map(line => '  ' + line).join('\n').trim()}
}
`;
    }

    protected async selectDebugType(): Promise<string | undefined> {
        const widget = this.editorManager.currentEditor;
        if (!widget) {
            return undefined;
        }
        const { languageId } = widget.editor.document;
        const debuggers = await this.debug.getDebuggersForLanguage(languageId);
        return this.quickPick.show(debuggers.map(
            ({ label, type }) => ({ label, value: type }),
            { placeholder: 'Select Environment' })
        );
    }

    @inject(StorageService)
    protected readonly storage: StorageService;

    async load(): Promise<void> {
        await this.initialized;
        const data = await this.storage.getData<DebugConfigurationManager.Data>('debug.configurations', {});
        if (data.current) {
            this.current = this.find(data.current.name, data.current.workspaceFolderUri);
        }
    }

    save(): void {
        const data: DebugConfigurationManager.Data = {};
        const { current } = this;
        if (current) {
            data.current = {
                name: current.configuration.name,
                workspaceFolderUri: current.workspaceFolderUri
            };
        }
        this.storage.setData('debug.configurations', data);
    }

}
export namespace DebugConfigurationManager {
    export interface Data {
        current?: {
            name: string
            workspaceFolderUri?: string
        }
    }
}
