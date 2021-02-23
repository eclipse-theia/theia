/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { WorkspaceExtImpl } from '../workspace';
import { isObject } from '../../common/types';
import cloneDeep = require('lodash.clonedeep');
import { URI } from '@theia/core/shared/vscode-uri';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class Configuration {

    private combinedConfig: ConfigurationModel | undefined;
    private folderCombinedConfigs: { [resource: string]: ConfigurationModel } = {};

    constructor(
        private defaultConfiguration: ConfigurationModel,
        private userConfiguration: ConfigurationModel,
        private workspaceConfiguration: ConfigurationModel = new ConfigurationModel(),
        private folderConfigurations: { [resource: string]: ConfigurationModel } = {},
    ) { }

    getValue(section: string | undefined, workspace: WorkspaceExtImpl, resource?: URI): any {
        return this.getCombinedResourceConfig(workspace, resource).getValue(section);
    }

    inspect<C>(key: string, workspace: WorkspaceExtImpl, resource?: URI): {
        default: C,
        user: C,
        workspace: C | undefined,
        workspaceFolder: C | undefined,
        value: C,
    } {
        const combinedConfiguration = this.getCombinedResourceConfig(workspace, resource);
        const folderConfiguration = this.getFolderResourceConfig(workspace, resource);
        return {
            default: this.defaultConfiguration.getValue(key),
            user: this.userConfiguration.getValue(key),
            workspace: workspace ? this.workspaceConfiguration.getValue(key) : undefined,
            workspaceFolder: folderConfiguration ? folderConfiguration.getValue(key) : undefined,
            value: combinedConfiguration.getValue(key)
        };
    }

    private getCombinedResourceConfig(workspace: WorkspaceExtImpl, resource?: URI): ConfigurationModel {
        const combinedConfig = this.getCombinedConfig();
        if (!workspace || !resource) {
            return combinedConfig;
        }

        const workspaceFolder = workspace.getWorkspaceFolder(resource);
        if (!workspaceFolder) {
            return combinedConfig;
        }

        return this.getFolderCombinedConfig(workspaceFolder.uri.toString()) || combinedConfig;
    }

    private getCombinedConfig(): ConfigurationModel {
        if (!this.combinedConfig) {
            this.combinedConfig = this.defaultConfiguration.merge(this.userConfiguration, this.workspaceConfiguration);
        }
        return this.combinedConfig;
    }

    private getFolderCombinedConfig(folder: string): ConfigurationModel | undefined {
        if (this.folderCombinedConfigs[folder]) {
            return this.folderCombinedConfigs[folder];
        }

        const combinedConfig = this.getCombinedConfig();
        const folderConfig = this.folderConfigurations[folder];
        if (!folderConfig) {
            return combinedConfig;
        }

        const folderCombinedConfig = combinedConfig.merge(folderConfig);
        this.folderCombinedConfigs[folder] = folderCombinedConfig;

        return folderCombinedConfig;
    }

    private getFolderResourceConfig(workspace: WorkspaceExtImpl, resource?: URI): ConfigurationModel | undefined {
        if (!workspace || !resource) {
            return;
        }

        const workspaceFolder = workspace.getWorkspaceFolder(resource);
        if (!workspaceFolder) {
            return;
        }
        return this.folderConfigurations[workspaceFolder.uri.toString()];
    }

}

export class ConfigurationModel {

    constructor(
        private contents: any = Object.create(null),
        private keys: string[] = [],
    ) { }

    getValue(section?: string): any {
        if (!section) {
            return this.contents;
        }

        const path = section.split('.');
        let current = this.contents;
        for (let i = 0; i < path.length; i++) {
            if (typeof current !== 'object' || current === null) {
                return undefined;
            }
            current = current[path[i]];
        }
        return current;
    }

    merge(...others: ConfigurationModel[]): ConfigurationModel {
        const contents = cloneDeep(this.contents);
        const allKeys = [...this.keys];

        for (const other of others) {
            this.mergeContents(contents, other.contents);
            this.mergeKeys(allKeys, other.keys);
        }
        return new ConfigurationModel(contents, allKeys);
    }

    private mergeContents(source: any, target: any): void {
        for (const key of Object.keys(target)) {
            if (key === '__proto__') {
                continue;
            }
            if (key in source) {
                if (isObject(source[key]) && isObject(target[key])) {
                    this.mergeContents(source[key], target[key]);
                    continue;
                }
            }
            source[key] = cloneDeep(target[key]);
        }
    }

    private mergeKeys(source: string[], target: string[]): void {
        for (const key of target) {
            if (source.indexOf(key) === -1) {
                source.push(key);
            }
        }
    }

}
