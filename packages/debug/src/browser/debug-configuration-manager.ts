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
import { Disposable, DisposableCollection, Event, Emitter, ResourceProvider, Resource } from '@theia/core';
import { QuickPickService, OpenerService, open } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { DebugService } from '../common/debug-service';
import { DebugConfiguration } from '../common/debug-configuration';

@injectable()
export class DebugConfigurationManager {
    private static readonly CONFIG = '.theia/launch.json';

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;
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

    protected readonly models = new Map<string, DebugConfigurationManager.Model>();
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
                const resource = await this.resourceProvider(uri);
                toDispose.push(resource);
                const content = await this.readContents(resource);
                const json = this.parseConfigurations(content);
                const value = { resource, content, json, toDispose };
                this.models.set(key, value);
                toDispose.push(Disposable.create(() => this.models.delete(key)));
                const reconcileConfigurations = debounce(async () => {
                    value.content = await this.readContents(resource);
                    value.json = this.parseConfigurations(value.content);
                    this.updateCurrentConfiguration();
                }, 50);
                if (resource.onDidChangeContents) {
                    toDispose.push(resource.onDidChangeContents(reconcileConfigurations));
                }
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
        for (const model of this.models.values()) {
            for (const configuration of model.json.configurations) {
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
            for (const configuration of model.json.configurations) {
                if (configuration.name === name) {
                    return configuration;
                }
            }
        }
        return undefined;
    }

    protected async readContents(resource: Resource): Promise<string | undefined> {
        try {
            return await resource.readContents();
        } catch (e) {
            return undefined;
        }
    }
    protected parseConfigurations(content: string | undefined): DebugConfigurationManager.JsonContent {
        const configurations: DebugConfiguration[] = [];
        if (!content) {
            return {
                version: '0.2.0',
                configurations
            };
        }
        const json: Partial<{
            configurations: Partial<DebugConfiguration>[]
        }> | undefined = jsoncparser.parse(content, undefined, { disallowComments: false });
        if (json && 'configurations' in json) {
            if (Array.isArray(json.configurations)) {
                json.configurations.filter(DebugConfiguration.is);
                for (const configuration of json.configurations) {
                    if (DebugConfiguration.is(configuration)) {
                        configurations.push(configuration);
                    }
                }
            }
        }
        return {
            ...json,
            configurations
        };
    }

    /**
     * Opens configuration file in the editor.
     */
    async openConfiguration(): Promise<void> {
        const model = this.models.values().next().value;
        if (!model) {
            return;
        }
        if (model.content === undefined) {
            await this.save(model);
        }
        await open(this.openerService, model.resource.uri, {
            mode: 'activate'
        });
    }

    /**
     * Adds a new configuration to the configuration file.
     */
    async addConfiguration(): Promise<void> {
        const model = this.models.values().next().value;
        if (!model) {
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
        model.json.configurations.unshift(newDebugConfiguration);
        this.currentConfiguration = newDebugConfiguration;
        await this.save(model);
        await this.openConfiguration();
    }
    protected async save(model: DebugConfigurationManager.Model): Promise<void> {
        const oldContent = model.content || '';
        const edits = jsoncparser.modify(oldContent, [], model.json, { formattingOptions: {} });
        const content = jsoncparser.applyEdits(oldContent, edits);
        model.content = content;
        await Resource.save(model.resource, { content });
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
export namespace DebugConfigurationManager {
    export interface JsonContent {
        configurations: DebugConfiguration[]
        // tslint:disable-next-line:no-any
        [property: string]: any
    }
    export interface Model {
        resource: Resource
        content: string | undefined
        json: JsonContent
        toDispose: DisposableCollection
    }
}
