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
import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Event, Emitter, ResourceProvider } from '@theia/core';
import { QuickPickService, OpenerService, open } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { DebugService } from '../common/debug-service';
import { DebugConfiguration } from '../common/debug-configuration';
import { DebugConfigurationModel } from './debug-configuration-model';

@injectable()
export class DebugConfigurationManager {

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
                    const model = new DebugConfigurationModel(provider, resource);
                    model.onDidChange(() => this.updateCurrentConfiguration());
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
        this.updateCurrentConfiguration();
    }, 500);

    get configurations(): IterableIterator<DebugConfiguration> {
        return this.getConfigurations();
    }
    protected *getConfigurations(): IterableIterator<DebugConfiguration> {
        for (const model of this.models.values()) {
            for (const configuration of model.configurations) {
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
        const debugType = await this.selectDebugType();
        if (!debugType) {
            return;
        }
        const newDebugConfiguration = await this.selectDebugConfiguration(debugType);
        if (!newDebugConfiguration) {
            return;
        }
        await model.addConfiguration(newDebugConfiguration);
        this.currentConfiguration = newDebugConfiguration;
        await this.doOpen(model);
    }
    protected async doOpen(model: DebugConfigurationModel): Promise<void> {
        if (!model.exists) {
            await model.save();
        }
        await open(this.openerService, model.uri, {
            mode: 'activate'
        });
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
