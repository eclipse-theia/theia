/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from 'inversify';
import { PluginDeployerEntry, PluginDeployerEntryType } from '../../common/plugin-protocol';
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

    isFile(): boolean {
        return this.delegate.isFile();
    }

    isDirectory(): boolean {
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

}
