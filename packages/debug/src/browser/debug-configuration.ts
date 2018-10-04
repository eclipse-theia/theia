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

import { injectable, inject, postConstruct } from 'inversify';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { QuickPickService, OpenerService, open } from '@theia/core/lib/browser';
import { DebugService, DebugConfiguration, LaunchConfig } from '../common/debug-common';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import * as jsoncparser from 'jsonc-parser';
import { Emitter, Event } from '@theia/core';
import { FileSystemWatcher, FileChangeEvent } from '@theia/filesystem/lib/browser/filesystem-watcher';

@injectable()
export class DebugConfigurationManager {
    @inject(FileSystem)
    // TODO: use MonacoTextModelService instead
    protected readonly fileSystem: FileSystem;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;
    @inject(DebugService)
    protected readonly debug: DebugService;
    @inject(QuickPickService)
    protected readonly quickPick: QuickPickService;
    @inject(VariableResolverService)
    protected readonly variableResolver: VariableResolverService;
    @inject(FileSystemWatcher)
    protected readonly fileSystemWatcher: FileSystemWatcher;

    protected readonly onDidConfigurationChangedEmitter = new Emitter<void>();

    private static readonly CONFIG = '.theia/launch.json';
    private uri: URI | undefined;

    @postConstruct()
    protected init() {
        this.workspaceService.onWorkspaceChanged(roots => {
            this.uri = roots.length > 0 ? new URI(roots[0].uri + '/' + DebugConfigurationManager.CONFIG) : undefined;
        });

        this.fileSystemWatcher.onFilesChanged(event => {
            if (this.uri && FileChangeEvent.isUpdated(event, this.uri)) {
                this.onDidConfigurationChangedEmitter.fire(undefined);
            }
        });
    }

    /**
     * Opens configuration file in the editor.
     */
    async openConfigurationFile(): Promise<void> {
        const configFile = await this.resolveConfigurationFile();
        await open(this.openerService, new URI(configFile.uri));
    }

    /**
     * Adds a new configuration to the configuration file.
     */
    async addConfiguration(): Promise<void> {
        const debugType = await this.selectDebugType();
        if (!debugType) {
            return;
        }
        const newDebugConfiguration = await this.selectDebugConfiguration(debugType);
        if (!newDebugConfiguration) {
            return;
        }
        const configurations = await this.readConfigurations();
        configurations.push(newDebugConfiguration);
        await this.writeConfigurations(configurations);
        this.openConfigurationFile();
    }

    /**
     * Selects the debug configuration to start debug adapter.
     */
    async selectConfiguration(): Promise<DebugConfiguration | undefined> {
        const configurations = await this.readConfigurations();
        const configuration = await this.quickPick.show(configurations.map(value => ({
            label: value.type + ' : ' + value.name,
            value
        })), {
                placeholder: 'Select launch configuration'
            });

        return await this.resolveDebugConfiguration(configuration);
    }

    async resolveDebugConfiguration(configuration: DebugConfiguration | undefined): Promise<DebugConfiguration | undefined> {
        const resolvedConfiguration = configuration && await this.debug.resolveDebugConfiguration(configuration);
        return resolvedConfiguration && this.variableResolver.resolve(resolvedConfiguration);
    }

    async readConfigurations(): Promise<DebugConfiguration[]> {
        const configFile = await this.internalReadConfig();
        return configFile.configurations;
    }

    protected async internalReadConfig(): Promise<LaunchConfig> {
        const configFile = await this.resolveConfigurationFile();
        const { content } = await this.fileSystem.resolveContent(configFile.uri);
        if (content.length === 0) {
            return {
                version: '0.2.0',
                configurations: []
            };
        }
        try {
            return jsoncparser.parse(content);
        } catch (error) {
            throw new Error('Configuration file bad format.');
        }
    }

    async writeConfigurations(configurations: DebugConfiguration[]): Promise<void> {
        const config = await this.internalReadConfig();
        config.configurations = configurations;
        // TODO use jsonc-parser instead
        const jsonPretty = JSON.stringify(config, (key, value) => value, 2);
        const configFile = await this.resolveConfigurationFile();
        await this.fileSystem.setContent(configFile, jsonPretty);
    }

    get onDidConfigurationChanged(): Event<void> {
        return this.onDidConfigurationChangedEmitter.event;
    }

    /**
     * Creates and returns configuration file.
     * @returns [configuration file](#FileStat).
     */
    protected async resolveConfigurationFile(): Promise<FileStat> {
        if (!this.uri) {
            throw new Error('Workspace is not opened yet.');
        }

        const fileName = this.uri.toString();
        const configFile = await this.fileSystem.exists(fileName)
            .then(exists => {
                if (exists) {
                    return this.fileSystem.getFileStat(fileName);
                } else {
                    return this.fileSystem.createFile(fileName, { encoding: 'utf8' });
                }
            });
        if (!configFile) {
            throw new Error(`Configuration file '${DebugConfigurationManager.CONFIG}' not found.`);
        }
        return configFile;
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
