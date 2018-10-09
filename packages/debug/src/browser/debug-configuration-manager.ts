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

import debounce = require('p-debounce');
import * as jsoncparser from 'jsonc-parser';
import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection, Event, Emitter, Reference } from '@theia/core';
import { QuickPickService, OpenerService, open } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { DebugService } from '../common/debug-service';
import { DebugConfiguration } from '../common/debug-configuration';

@injectable()
export class DebugConfigurationManager {
    private static readonly CONFIG = '.theia/launch.json';

    @inject(MonacoTextModelService)
    protected readonly modelService: MonacoTextModelService;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;
    @inject(DebugService)
    protected readonly debug: DebugService;
    @inject(QuickPickService)
    protected readonly quickPick: QuickPickService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected async init(): Promise<void> {
        this.updateModels();
        this.workspaceService.onWorkspaceChanged(() => this.updateModels());
    }

    protected readonly models = new Map<string, {
        reference: Reference<MonacoEditorModel>
        configurations: DebugConfiguration[],
        toDispose: DisposableCollection
    }>();
    protected updateModels = debounce(async () => {
        const roots = await this.workspaceService.roots;
        const toDelete = new Set(this.models.keys());
        for (const rootStat of roots) {
            const root = new URI(rootStat.uri);
            const uri = root.resolve(DebugConfigurationManager.CONFIG);
            const key = uri.toString();
            toDelete.delete(key);
            if (!this.models.has(key)) {
                const toDispose = new DisposableCollection();
                const reference = await this.modelService.createModelReference(uri);
                toDispose.push(reference);
                const configurations = this.parseConfigurations(reference.object);
                const value = { reference, configurations, toDispose };
                this.models.set(key, value);
                toDispose.push(Disposable.create(() => this.models.delete(key)));
                const reconcileConfigurations = debounce(() => {
                    value.configurations = this.parseConfigurations(reference.object);
                    this.updateCurrentConfiguration();
                }, 250);
                toDispose.push(reference.object.onDidChangeContent(reconcileConfigurations));
            }
        }
        for (const uri of toDelete) {
            const model = this.models.get(uri);
            if (model) {
                model.toDispose.dispose();
            }
        }
        this.updateCurrentConfiguration();
    }, 500);

    get configurations(): IterableIterator<DebugConfiguration> {
        return this.getConfigurations();
    }
    protected *getConfigurations(): IterableIterator<DebugConfiguration> {
        for (const uri of this.models.keys()) {
            for (const configuration of this.models.get(uri)!.configurations) {
                yield configuration;
            }
        }
    }

    protected _currentConfiguration: DebugConfiguration | undefined;
    get currentConfiguration(): DebugConfiguration | undefined {
        return this._currentConfiguration;
    }
    set currentConfiguration(configuration: DebugConfiguration | undefined) {
        this.updateCurrentConfiguration(configuration);
    }
    protected updateCurrentConfiguration(configuration: DebugConfiguration | undefined = this._currentConfiguration): void {
        this._currentConfiguration = configuration && this.findConfiguration(configuration.name) || this.configurations.next().value;
        this.onDidChangeEmitter.fire(undefined);
    }
    findConfiguration(name: string): DebugConfiguration | undefined {
        for (const model of this.models.values()) {
            for (const configuration of model.configurations) {
                if (configuration.name === name) {
                    return configuration;
                }
            }
        }
        return undefined;
    }

    protected parseConfigurations(model: MonacoEditorModel): DebugConfiguration[] {
        const result = [];
        const content = model.getText();
        const jsonContent: Partial<{
            configurations: Partial<DebugConfiguration>[]
        }> | undefined = jsoncparser.parse(jsoncparser.stripComments(content));
        if (jsonContent && 'configurations' in jsonContent) {
            const { configurations } = jsonContent;
            if (Array.isArray(configurations)) {
                configurations.filter(DebugConfiguration.is);
                for (const configuration of configurations) {
                    if (DebugConfiguration.is(configuration)) {
                        result.push(configuration);
                    }
                }
            }
        }
        return result;
    }

    /**
     * Opens configuration file in the editor.
     */
    async openConfiguration(): Promise<void> {
        const uri = this.models.keys().next().value;
        if (uri) {
            await open(this.openerService, new URI(uri), {
                mode: 'activate'
            });
        }
    }

    /**
     * Adds a new configuration to the configuration file.
     */
    async addConfiguration(): Promise<void> {
        const uri = this.models.keys().next().value;
        if (!uri) {
            return;
        }
        const debugType = await this.selectDebugType();
        if (!debugType) {
            return;
        }
        const newDebugConfiguration = await this.selectDebugConfiguration(debugType);
        if (!newDebugConfiguration) {
            return;
        }
        const configurations = this.models.get(uri)!.configurations;
        configurations.push(newDebugConfiguration);
        await Promise.all([
            this.writeConfigurations(uri, configurations),
            this.openConfiguration()]
        );
    }
    protected async writeConfigurations(uri: string, configurations: DebugConfiguration[]): Promise<void> {
        if (!this.models.has(uri)) {
            return;
        }
        const { reference } = this.models.get(uri)!;
        const model = reference.object['model'];
        const content = model.getValue();
        const jsonContent = jsoncparser.parse(jsoncparser.stripComments(content)) || { version: '0.2.0' };
        jsonContent.configurations = configurations;

        // TODO use jsonc-parser instead
        model.setValue(JSON.stringify(jsonContent, undefined, 2));
        await reference.object.save();
    }

    async selectConfiguration(): Promise<DebugConfiguration | undefined> {
        const configurations = Array.from(this.configurations);
        return this.quickPick.show(configurations.map(value => ({
            label: value.type + ' : ' + value.name,
            value
        })), { placeholder: 'Select launch configuration' });
    }

    protected async selectDebugType(): Promise<string | undefined> {
        const debugTypes = await this.debug.debugTypes();
        return this.quickPick.show(debugTypes, { placeholder: 'Select Debug Type' });
    }

    protected async selectDebugConfiguration(debugType: string): Promise<DebugConfiguration | undefined> {
        const configurations = await this.debug.provideDebugConfigurations(debugType);
        return this.quickPick.show(configurations.map(value => ({
            label: value.name,
            value
        }), { placeholder: 'Select Debug Configuration' }));
    }

}
