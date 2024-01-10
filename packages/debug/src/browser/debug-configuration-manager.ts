// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import debounce = require('p-debounce');
import { visit, parse } from 'jsonc-parser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Emitter, Event, WaitUntilEvent } from '@theia/core/lib/common/event';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { LabelProvider, PreferenceScope, PreferenceService, QuickPickValue, StorageService } from '@theia/core/lib/browser';
import { QuickPickService } from '@theia/core/lib/common/quick-pick-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { DebugConfigurationModel } from './debug-configuration-model';
import { DebugSessionOptions, DynamicDebugConfigurationSessionOptions } from './debug-session-options';
import { DebugService } from '../common/debug-service';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DebugConfiguration } from '../common/debug-common';
import { WorkspaceVariableContribution } from '@theia/workspace/lib/browser/workspace-variable-contribution';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import * as monaco from '@theia/monaco-editor-core';
import { ICommandService } from '@theia/monaco-editor-core/esm/vs/platform/commands/common/commands';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { nls } from '@theia/core';
import { DebugCompound } from '../common/debug-compound';

export interface WillProvideDebugConfiguration extends WaitUntilEvent {
}

@injectable()
export class DebugConfigurationManager {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(EditorManager)
    protected readonly editorManager: EditorManager;
    @inject(DebugService)
    protected readonly debug: DebugService;
    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(PreferenceConfigurations)
    protected readonly preferenceConfigurations: PreferenceConfigurations;

    @inject(WorkspaceVariableContribution)
    protected readonly workspaceVariables: WorkspaceVariableContribution;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly onWillProvideDebugConfigurationEmitter = new Emitter<WillProvideDebugConfiguration>();
    readonly onWillProvideDebugConfiguration: Event<WillProvideDebugConfiguration> = this.onWillProvideDebugConfigurationEmitter.event;

    protected readonly onWillProvideDynamicDebugConfigurationEmitter = new Emitter<WillProvideDebugConfiguration>();
    get onWillProvideDynamicDebugConfiguration(): Event<WillProvideDebugConfiguration> {
        return this.onWillProvideDynamicDebugConfigurationEmitter.event;
    }

    get onDidChangeConfigurationProviders(): Event<void> {
        return this.debug.onDidChangeDebugConfigurationProviders;
    }

    protected debugConfigurationTypeKey: ContextKey<string>;

    protected initialized: Promise<void>;

    protected recentDynamicOptionsTracker: DynamicDebugConfigurationSessionOptions[] = [];

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        this.debugConfigurationTypeKey = this.contextKeyService.createKey<string>('debugConfigurationType', undefined);
        this.initialized = this.preferences.ready.then(() => {
            this.workspaceService.onWorkspaceChanged(this.updateModels);
            this.preferences.onPreferenceChanged(e => {
                if (e.preferenceName === 'launch') {
                    this.updateModels();
                }
            });
            return this.updateModels();
        });
    }

    protected readonly models = new Map<string, DebugConfigurationModel>();
    protected updateModels = debounce(async () => {
        const roots = await this.workspaceService.roots;
        const toDelete = new Set(this.models.keys());
        for (const rootStat of roots) {
            const key = rootStat.resource.toString();
            toDelete.delete(key);
            if (!this.models.has(key)) {
                const model = new DebugConfigurationModel(key, this.preferences);
                model.onDidChange(() => this.updateCurrent());
                model.onDispose(() => this.models.delete(key));
                this.models.set(key, model);
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

    /**
     * All _non-dynamic_ debug configurations.
     */
    get all(): IterableIterator<DebugSessionOptions> {
        return this.getAll();
    }
    protected *getAll(): IterableIterator<DebugSessionOptions> {
        for (const model of this.models.values()) {
            for (const configuration of model.configurations) {
                yield this.configurationToOptions(configuration, model.workspaceFolderUri);
            }
            for (const compound of model.compounds) {
                yield this.compoundToOptions(compound, model.workspaceFolderUri);
            }
        }
    }

    get supported(): Promise<IterableIterator<DebugSessionOptions>> {
        return this.getSupported();
    }
    protected async getSupported(): Promise<IterableIterator<DebugSessionOptions>> {
        await this.initialized;
        const debugTypes = await this.debug.debugTypes();
        return this.doGetSupported(new Set(debugTypes));
    }
    protected *doGetSupported(debugTypes: Set<string>): IterableIterator<DebugSessionOptions> {
        for (const options of this.getAll()) {
            if (options.configuration && debugTypes.has(options.configuration.type)) {
                yield options;
            }
        }
    }

    protected _currentOptions: DebugSessionOptions | undefined;
    get current(): DebugSessionOptions | undefined {
        return this._currentOptions;
    }

    async getSelectedConfiguration(): Promise<DebugSessionOptions | undefined> {
        if (!DebugSessionOptions.isDynamic(this._currentOptions)) {
            return this._currentOptions;
        }

        // Refresh a dynamic configuration from the provider.
        // This allow providers to update properties before the execution e.g. program
        const { providerType, workspaceFolderUri, configuration: { name } } = this._currentOptions;
        const configuration = await this.fetchDynamicDebugConfiguration(name, providerType, workspaceFolderUri);

        if (!configuration) {
            const message = nls.localize(
                'theia/debug/missingConfiguration',
                "Dynamic configuration '{0}:{1}' is missing or not applicable", providerType, name);
            throw new Error(message);
        }

        return { name, configuration, providerType, workspaceFolderUri };
    }

    set current(option: DebugSessionOptions | undefined) {
        this.updateCurrent(option);
        this.updateRecentlyUsedDynamicConfigurationOptions(option);
    }

    protected updateRecentlyUsedDynamicConfigurationOptions(option: DebugSessionOptions | undefined): void {
        if (DebugSessionOptions.isDynamic(option)) {
            // Removing an item already present in the list
            const index = this.recentDynamicOptionsTracker.findIndex(item => this.dynamicOptionsMatch(item, option));
            if (index > -1) {
                this.recentDynamicOptionsTracker.splice(index, 1);
            }
            // Adding new item, most recent at the top of the list
            const recentMax = 3;
            if (this.recentDynamicOptionsTracker.unshift(option) > recentMax) {
                // Keep the latest 3 dynamic configuration options to not clutter the dropdown.
                this.recentDynamicOptionsTracker.splice(recentMax);
            }
        }
    }

    protected dynamicOptionsMatch(one: DynamicDebugConfigurationSessionOptions, other: DynamicDebugConfigurationSessionOptions): boolean {
        return one.providerType !== undefined
            && one.configuration.name === other.configuration.name
            && one.providerType === other.providerType
            && one.workspaceFolderUri === other.workspaceFolderUri;
    }

    get recentDynamicOptions(): readonly DynamicDebugConfigurationSessionOptions[] {
        return this.recentDynamicOptionsTracker;
    }

    protected updateCurrent(options: DebugSessionOptions | undefined = this._currentOptions): void {
        if (DebugSessionOptions.isCompound(options)) {
            this._currentOptions = options && this.find(options.compound, options.workspaceFolderUri);
        } else {
            this._currentOptions = options && this.find(options.configuration, options.workspaceFolderUri, options.providerType);
        }

        if (!this._currentOptions) {
            const model = this.getModel();
            if (model) {
                const configuration = model.configurations[0];
                if (configuration) {
                    this._currentOptions = this.configurationToOptions(configuration, model.workspaceFolderUri);
                }
            }
        }
        this.debugConfigurationTypeKey.set(this.current && this.current.configuration?.type);
        this.onDidChangeEmitter.fire(undefined);
    }

    /**
     * @deprecated since v1.27.0
     */
    find(name: string, workspaceFolderUri: string): DebugSessionOptions | undefined;
    /**
     * Find / Resolve DebugSessionOptions from a given target debug configuration
     */
    find(compound: DebugCompound, workspaceFolderUri?: string): DebugSessionOptions | undefined;
    find(configuration: DebugConfiguration, workspaceFolderUri?: string, providerType?: string): DebugSessionOptions | undefined;
    find(name: string, workspaceFolderUri?: string, providerType?: string): DebugSessionOptions | undefined;
    find(nameOrConfigurationOrCompound: string | DebugConfiguration | DebugCompound, workspaceFolderUri?: string, providerType?: string): DebugSessionOptions | undefined {
        if (DebugConfiguration.is(nameOrConfigurationOrCompound) && providerType) {
            // providerType is only applicable to dynamic debug configurations and may only be created if we have a configuration given
            return this.configurationToOptions(nameOrConfigurationOrCompound, workspaceFolderUri, providerType);
        }
        const name = typeof nameOrConfigurationOrCompound === 'string' ? nameOrConfigurationOrCompound : nameOrConfigurationOrCompound.name;
        const configuration = this.findConfiguration(name, workspaceFolderUri);
        if (configuration) {
            return this.configurationToOptions(configuration, workspaceFolderUri);
        }
        const compound = this.findCompound(name, workspaceFolderUri);
        if (compound) {
            return this.compoundToOptions(compound, workspaceFolderUri);
        }
    }

    findConfigurations(name: string, workspaceFolderUri?: string): DebugConfiguration[] {
        const matches = [];
        for (const model of this.models.values()) {
            if (model.workspaceFolderUri === workspaceFolderUri) {
                for (const configuration of model.configurations) {
                    if (configuration.name === name) {
                        matches.push(configuration);
                    }
                }
            }
        }
        return matches;
    }

    findConfiguration(name: string, workspaceFolderUri?: string): DebugConfiguration | undefined {
        for (const model of this.models.values()) {
            if (model.workspaceFolderUri === workspaceFolderUri) {
                for (const configuration of model.configurations) {
                    if (configuration.name === name) {
                        return configuration;
                    }
                }
            }
        }
    }

    findCompound(name: string, workspaceFolderUri?: string): DebugCompound | undefined {
        for (const model of this.models.values()) {
            if (model.workspaceFolderUri === workspaceFolderUri) {
                for (const compound of model.compounds) {
                    if (compound.name === name) {
                        return compound;
                    }
                }
            }
        }
    }

    async openConfiguration(): Promise<void> {
        const currentUri = new URI(this.current?.workspaceFolderUri);
        const model = this.getModel(currentUri);
        if (model) {
            await this.doOpen(model);
        }
    }

    protected configurationToOptions(configuration: DebugConfiguration, workspaceFolderUri?: string, providerType?: string): DebugSessionOptions {
        return { name: configuration.name, configuration, providerType, workspaceFolderUri };
    }

    protected compoundToOptions(compound: DebugCompound, workspaceFolderUri?: string): DebugSessionOptions {
        return { name: compound.name, compound, workspaceFolderUri };
    }

    async addConfiguration(): Promise<void> {
        let rootUri: URI | undefined = undefined;
        if (this.workspaceService.saved && this.workspaceService.tryGetRoots().length > 1) {
            rootUri = await this.selectRootUri();
            // Do not continue if the user explicitly does not choose a location.
            if (!rootUri) {
                return;
            }
        }

        const model = this.getModel(rootUri);
        if (!model) {
            return;
        }
        const widget = await this.doOpen(model);
        if (!(widget.editor instanceof MonacoEditor)) {
            return;
        }
        const editor = widget.editor.getControl();
        const commandService = StandaloneServices.get(ICommandService);
        let position: monaco.Position | undefined;
        let depthInArray = 0;
        let lastProperty = '';
        visit(editor.getValue(), {
            onObjectProperty: property => {
                lastProperty = property;
            },
            onArrayBegin: offset => {
                if (lastProperty === 'configurations' && depthInArray === 0) {
                    position = editor.getModel()!.getPositionAt(offset + 1);
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
        if (editor.getModel()!.getLineLastNonWhitespaceColumn(position.lineNumber) > position.column) {
            editor.setPosition(position);
            editor.trigger('debug', 'lineBreakInsert', undefined);
        }
        // Check if there is already an empty line to insert suggest, if yes just place the cursor
        if (editor.getModel()!.getLineLastNonWhitespaceColumn(position.lineNumber + 1) === 0) {
            editor.setPosition({ lineNumber: position.lineNumber + 1, column: 1 << 30 });
            await commandService.executeCommand('editor.action.deleteLines');
        }
        editor.setPosition(position);
        await commandService.executeCommand('editor.action.insertLineAfter');
        await commandService.executeCommand('editor.action.triggerSuggest');
    }

    protected async selectRootUri(): Promise<URI | undefined> {
        const workspaceRoots = this.workspaceService.tryGetRoots();
        const items: QuickPickValue<URI>[] = [];
        for (const workspaceRoot of workspaceRoots) {
            items.push({
                label: this.labelProvider.getName(workspaceRoot.resource),
                description: this.labelProvider.getLongName(workspaceRoot.resource),
                value: workspaceRoot.resource
            });
        }
        const root = await this.quickPickService.show(items, {
            placeholder: nls.localize('theia/debug/addConfigurationPlaceholder', 'Select workspace root to add configuration to'),
        });
        return root?.value;
    }

    protected getModel(uri?: URI): DebugConfigurationModel | undefined {
        const workspaceFolderUri = this.workspaceVariables.getWorkspaceRootUri(uri);
        if (workspaceFolderUri) {
            const key = workspaceFolderUri.toString();
            for (const model of this.models.values()) {
                if (model.workspaceFolderUri === key) {
                    return model;
                }
            }
        }
        for (const model of this.models.values()) {
            if (model.uri) {
                return model;
            }
        }
        return this.models.values().next().value;
    }

    protected async doOpen(model: DebugConfigurationModel): Promise<EditorWidget> {
        const uri = await this.doCreate(model);

        return this.editorManager.open(uri, {
            mode: 'activate'
        });
    }

    protected async doCreate(model: DebugConfigurationModel): Promise<URI> {
        const uri = model.uri ?? this.preferences.getConfigUri(PreferenceScope.Folder, model.workspaceFolderUri, 'launch');
        if (!uri) { // Since we are requesting information about a known workspace folder, this should never happen.
            throw new Error('PreferenceService.getConfigUri has returned undefined when a URI was expected.');
        }
        const settingsUri = this.preferences.getConfigUri(PreferenceScope.Folder, model.workspaceFolderUri);
        // Users may have placed their debug configurations in a `settings.json`, in which case we shouldn't modify the file.
        if (settingsUri && !uri.isEqual(settingsUri)) {
            await this.ensureContent(uri, model);
        }
        return uri;
    }

    /**
     * Checks whether a `launch.json` file contains the minimum necessary content.
     * If content not found, provides content and populates the file using Monaco.
     */
    protected async ensureContent(uri: URI, model: DebugConfigurationModel): Promise<void> {
        const textModel = await this.textModelService.createModelReference(uri);
        const currentContent = textModel.object.valid ? textModel.object.getText() : '';
        try { // Look for the minimal well-formed launch.json content: {configurations: []}
            const parsedContent = parse(currentContent);
            if (Array.isArray(parsedContent.configurations)) {
                return;
            }
        } catch {
            // Just keep going
        }
        const debugType = await this.selectDebugType();
        const configurations = debugType ? await this.provideDebugConfigurations(debugType, model.workspaceFolderUri) : [];
        const content = this.getInitialConfigurationContent(configurations);
        textModel.object.textEditorModel.setValue(content); // Will clobber anything the user has entered!
        await textModel.object.save();
    }

    protected async provideDebugConfigurations(debugType: string, workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]> {
        await this.fireWillProvideDebugConfiguration();
        return this.debug.provideDebugConfigurations(debugType, workspaceFolderUri);
    }
    protected async fireWillProvideDebugConfiguration(): Promise<void> {
        await WaitUntilEvent.fire(this.onWillProvideDebugConfigurationEmitter, {});
    }

    async provideDynamicDebugConfigurations(): Promise<Record<string, DynamicDebugConfigurationSessionOptions[]>> {
        await this.fireWillProvideDynamicDebugConfiguration();
        const roots = this.workspaceService.tryGetRoots();
        const promises = roots.map(async root => {
            const configsMap = await this.debug.provideDynamicDebugConfigurations!(root.resource.toString());
            const optionsMap = Object.fromEntries(Object.entries(configsMap).map(([type, configs]) => {
                const options = configs.map(config => ({
                    name: config.name,
                    providerType: type,
                    configuration: config,
                    workspaceFolderUri: root.resource.toString()
                }));
                return [type, options];
            }));
            return optionsMap;
        });

        const typesToOptionsRecords = await Promise.all(promises);
        const consolidatedTypesToOptions: Record<string, DynamicDebugConfigurationSessionOptions[]> = {};

        for (const typesToOptionsInstance of typesToOptionsRecords) {
            for (const [providerType, configurationsOptions] of Object.entries(typesToOptionsInstance)) {
                if (!consolidatedTypesToOptions[providerType]) {
                    consolidatedTypesToOptions[providerType] = [];
                }
                consolidatedTypesToOptions[providerType].push(...configurationsOptions);
            }
        }
        return consolidatedTypesToOptions;
    }

    async fetchDynamicDebugConfiguration(name: string, type: string, folder?: string): Promise<DebugConfiguration | undefined> {
        await this.fireWillProvideDynamicDebugConfiguration();
        return this.debug.fetchDynamicDebugConfiguration(name, type, folder);
    }

    protected async fireWillProvideDynamicDebugConfiguration(): Promise<void> {
        await this.initialized;
        await WaitUntilEvent.fire(this.onWillProvideDynamicDebugConfigurationEmitter, {});
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
        if (debuggers.length === 0) {
            return undefined;
        }
        const items: Array<QuickPickValue<string>> = debuggers.map(({ label, type }) => ({ label, value: type }));
        const selectedItem = await this.quickPickService.show(items, { placeholder: 'Select Environment' });
        return selectedItem?.value;
    }

    @inject(StorageService)
    protected readonly storage: StorageService;

    async load(): Promise<void> {
        await this.initialized;
        const data = await this.storage.getData<DebugConfigurationManager.Data>('debug.configurations', {});
        this.resolveRecentDynamicOptionsFromData(data.recentDynamicOptions);

        // Between versions v1.26 and v1.27, the expected format of the data changed so that old stored data
        // may not contain the configuration key.
        if (DebugSessionOptions.isConfiguration(data.current)) {
            // ensure options name is reflected from old configurations data
            data.current.name = data.current.name ?? data.current.configuration?.name;
            this.current = this.find(data.current.configuration, data.current.workspaceFolderUri, data.current.providerType);
        } else if (DebugSessionOptions.isCompound(data.current)) {
            this.current = this.find(data.current.name, data.current.workspaceFolderUri);
        }
    }

    protected resolveRecentDynamicOptionsFromData(options?: DynamicDebugConfigurationSessionOptions[]): void {
        if (!options || this.recentDynamicOptionsTracker.length !== 0) {
            return;
        }

        // ensure options name is reflected from old configurations data
        const dynamicOptions = options.map(option => {
            option.name = option.name ?? option.configuration.name;
            return option;
        }).filter(DebugSessionOptions.isDynamic);
        this.recentDynamicOptionsTracker = dynamicOptions;
    }

    save(): void {
        const data: DebugConfigurationManager.Data = {};
        const { current, recentDynamicOptionsTracker } = this;
        if (current) {
            data.current = current;
        }

        if (this.recentDynamicOptionsTracker.length > 0) {
            data.recentDynamicOptions = recentDynamicOptionsTracker;
        }

        if (Object.keys(data).length > 0) {
            this.storage.setData('debug.configurations', data);
        }
    }
}

export namespace DebugConfigurationManager {
    export interface Data {
        current?: DebugSessionOptions,
        recentDynamicOptions?: DynamicDebugConfigurationSessionOptions[]
    }
}
