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
import { injectable } from '@theia/core/shared/inversify';
import { PluginDeployerEntry, PluginDeployerEntryType, PluginType } from '../../common/plugin-protocol';
import { PluginDeployerEntryImpl } from './plugin-deployer-entry-impl';

/**
 * Proxify call to plugin deployer entry by adding the deployer name as part of the updating path
 */
@injectable()
export class ProxyPluginDeployerEntry<T> implements PluginDeployerEntry {

    private readonly deployerName: string;

    constructor(readonly deployer: T, readonly delegate: PluginDeployerEntryImpl) {
        this.deployerName = (this.deployer as {}).constructor.name;
    }

    id(): string {
        return this.delegate.id();
    }
    originalPath(): string {
        return this.delegate.originalPath();
    }
    path(): string {
        return this.delegate.path();
    }

    getValue<V>(key: string): V {
        return this.delegate.getValue(key);
    }
    storeValue<V>(key: string, value: V): void {
        this.delegate.storeValue(key, value);
    }

    updatePath(newPath: string): void {
        this.delegate.updatePath(newPath, this.deployerName);
    }

    getChanges(): string[] {
        return this.delegate.getChanges();
    }

    isFile(): Promise<boolean> {
        return this.delegate.isFile();
    }

    isDirectory(): Promise<boolean> {
        return this.delegate.isDirectory();
    }
    isResolved(): boolean {
        return this.delegate.isResolved();
    }
    isAccepted(...types: PluginDeployerEntryType[]): boolean {
        return this.delegate.isAccepted(...types);
    }
    accept(...types: PluginDeployerEntryType[]): void {
        this.delegate.accept(...types);
    }
    hasError(): boolean {
        return this.delegate.hasError();
    }
    resolvedBy(): string {
        return this.delegate.resolvedBy();
    }

    get type(): PluginType {
        return this.delegate.type;
    }

    set type(type: PluginType) {
        this.delegate.type = type;
    }

    get rootPath(): string {
        return this.delegate.rootPath;
    }

    set rootPath(rootPath: string) {
        this.delegate.rootPath = rootPath;
    }

}
