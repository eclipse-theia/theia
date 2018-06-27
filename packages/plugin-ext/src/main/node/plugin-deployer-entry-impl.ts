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

import { PluginDeployerEntry, PluginDeployerEntryType } from "../../common/plugin-protocol";
import * as fs from 'fs';

export class PluginDeployerEntryImpl implements PluginDeployerEntry {

    private initPath: string;

    private currentPath: string;

    private map: Map<string, any>;

    private resolved: boolean;
    private acceptedTypes: PluginDeployerEntryType[];

    private changes: string[];

    private resolvedByName: string;

    constructor(readonly originId: string, readonly pluginId: string, initPath?: string) {
        this.map = new Map();
        this.changes = [];
        this.acceptedTypes = [];
        if (initPath) {
            this.currentPath = initPath;
            this.initPath = initPath;
            this.resolved = true;
        } else {
            this.resolved = false;
        }
    }

    id(): string {
        return this.pluginId;
    }
    originalPath(): string {
        return this.initPath;
    }
    path(): string {
        return this.currentPath;
    }
    getValue<T>(key: string): T {
        return this.map.get(key);
    }
    storeValue<T>(key: string, value: T): void {
        this.map.set(key, value);
    }
    updatePath(newPath: string, transformerName?: string): void {
        if (transformerName) {
            this.changes.push(transformerName);
        }
        this.currentPath = newPath;
    }
    getChanges(): string[] {
        return this.changes;
    }
    isFile(): boolean {
        try {
            return fs.lstatSync(this.currentPath).isFile();
        } catch (e) {
            return false;
        }
    }
    isDirectory(): boolean {
        try {
            return fs.lstatSync(this.currentPath).isDirectory();
        } catch (e) {
            return false;
        }
    }
    hasError(): boolean {
        throw new Error("Method not implemented.");
    }

    isResolved(): boolean {
        return this.resolved;
    }

    accept(...types: PluginDeployerEntryType[]): void {
        this.acceptedTypes = types;
    }

    isAccepted(...types: PluginDeployerEntryType[]): boolean {
        return types.some(type => this.acceptedTypes.indexOf(type) >= 0);
    }

    setResolvedBy(name: string) {
        this.resolvedByName = name;
    }

    resolvedBy(): string {
        return this.resolvedByName;
    }

}
