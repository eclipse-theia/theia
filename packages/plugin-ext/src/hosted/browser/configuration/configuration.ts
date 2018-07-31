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

import * as objects from './objects';
import * as types from './types';

export interface IConfigurationModel {
    contents: any;
    keys: string[];
    // overrides: IOverrides[];
}

export class Configuration {
// private baseWorkspaceConsolidatedConfiguration: ConfigurationModel = null;
// // map with resources configuration
// private _foldersConsolidatedConfigurations: ResourceMap<ConfigurationModel> = new ResourceMap<ConfigurationModel>();
}

export function compare(from: IConfigurationModel, to: IConfigurationModel): { added: string[], removed: string[], updated: string[] } {
    const added = to.keys.filter(key => from.keys.indexOf(key) === -1);
    const removed = from.keys.filter(key => to.keys.indexOf(key) === -1);
    const updated = [];

    for (const key of from.keys) {
        const value1 = getConfigurationValue(from.contents, key);
        const value2 = getConfigurationValue(to.contents, key);
        if (!objects.equals(value1, value2)) {
            updated.push(key);
        }
    }

    return { added, removed, updated };
}

export function toValuesTree(properties: { [qualifiedKey: string]: any }, conflictReporter: (message: string) => void): any {
    const root = Object.create(null);

    // tslint:disable-next-line:forin
    for (const key in properties) {
        addToValueTree(root, key, properties[key], conflictReporter);
    }

    return root;
}

export function addToValueTree(settingsTreeRoot: any, key: string, value: any, conflictReporter: (message: string) => void): void {
    const segments = key.split('.');
    const last = segments.pop();

    let curr = settingsTreeRoot;
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        let obj = curr[s];
        switch (typeof obj) {
            case 'undefined':
                obj = curr[s] = Object.create(null);
                break;
            case 'object':
                break;
            default:
                conflictReporter(`Ignoring ${key} as ${segments.slice(0, i + 1).join('.')} is ${JSON.stringify(obj)}`);
                return;
        }
        curr = obj;
    }

    if (last !== void 0 && typeof curr === 'object') {
        (curr as any)[last] = value; // workaround https://github.com/Microsoft/vscode/issues/13606
    } else {
        conflictReporter(`Ignoring ${key} as ${segments.join('.')} is ${JSON.stringify(curr)}`);
    }
}

export function removeFromValueTree(valueTree: any, key: string): void {
    const segments = key.split('.');
    doRemoveFromValueTree(valueTree, segments);
}

function doRemoveFromValueTree(valueTree: any, segments: string[]): void {
    const first = segments.shift();
    if (first === void 0) {
        return;
    }
    if (segments.length === 0) {
        // Reached last segment
        delete valueTree[first];
        return;
    }

    if (Object.keys(valueTree).indexOf(first) !== -1) {
        const value = valueTree[first];
        if (typeof value === 'object' && !Array.isArray(value)) {
            doRemoveFromValueTree(value, segments);
            if (Object.keys(value).length === 0) {
                delete valueTree[first];
            }
        }
    }
}

/**
 * A helper function to get the configuration value with a specific settings path (e.g. config.some.setting)
 */
export function getConfigurationValue<T>(config: any, settingPath: string, defaultValue?: T): T {
    // tslint:disable-next-line:no-shadowed-variable
    function accessSetting(config: any, path: string[]): any {
        let current = config;
        for (let i = 0; i < path.length; i++) {
            if (typeof current !== 'object' || current === null) {
                return undefined;
            }
            current = current[path[i]];
        }
        return <T>current;
    }

    const path = settingPath.split('.');
    const result = accessSetting(config, path);

    return typeof result === 'undefined' ? defaultValue : result;
}

export function merge(base: any, add: any, overwrite: boolean): void {
    Object.keys(add).forEach(key => {
        if (key in base) {
            if (types.isObject(base[key]) && types.isObject(add[key])) {
                merge(base[key], add[key], overwrite);
            } else if (overwrite) {
                base[key] = add[key];
            }
        } else {
            base[key] = add[key];
        }
    });
}

export function overrideIdentifierFromKey(key: string): string {
    return key.substring(1, key.length - 1);
}

export function keyFromOverrideIdentifier(overrideIdentifier: string): string {
    return `[${overrideIdentifier}]`;
}
