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

/* tslint:disable:no-any */

export class Configuration {

    private configuration: ConfigurationModel | undefined;

    constructor(
        private defaultConfiguration: ConfigurationModel,
        private userConfiguration: ConfigurationModel,
        private workspaceConfiguration: ConfigurationModel = new ConfigurationModel(),
    ) { }

    getValue(section?: string): any {
        return this.getCombined().getValue(section);
    }

    inspect<C>(key: string, workspace: WorkspaceExtImpl): {
        default: C,
        user: C,
        workspace: C | undefined,
        value: C,
    } {
        const combinedConfiguration = this.getCombined();
        return {
            default: this.defaultConfiguration.getValue(key),
            user: this.userConfiguration.getValue(key),
            workspace: workspace ? this.workspaceConfiguration.getValue(key) : void 0,
            value: combinedConfiguration.getValue(key)
        };
    }

    private getCombined(): ConfigurationModel {
        if (!this.configuration) {
            this.configuration = this.defaultConfiguration.merge(this.userConfiguration, this.workspaceConfiguration);
        }
        return this.configuration;
    }

}

export class ConfigurationModel {

    constructor(
        private contents: any = {},
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
