// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from 'inversify';
import { ContainerFactory } from './container-factory';
import { ContainerScope, ContainerScopeContribution, ContainerScopeManager, ScopeLifecycle } from './container-scope';
import { Emitter, Event } from './event';
import { logError } from './types';

export class ContainerScopeManagerImpl<T> implements ContainerScopeManager<T> {

    protected scopes = new AsyncDefaultMap<T, ContainerScope>();

    constructor(
        protected containerFactory: ContainerFactory,
        protected containerScopeContribution: ContainerScopeContribution[],
        protected scopeBinding?: interfaces.ServiceIdentifier<T>
    ) { }

    get(key: T): ContainerScope | undefined {
        return this.scopes.get(key);
    }

    getAll(): ReadonlyMap<T, ContainerScope> {
        return this.scopes;
    }

    async create(key: T): Promise<ContainerScope> {
        return this.scopes.create(key, async () => {
            const scope = await this.createContainerScope(key);
            scope.onDispose(() => this.scopes.delete(key));
            return scope;
        });
    }

    async getOrCreate(key: T): Promise<ContainerScope> {
        return this.scopes.getOrCreate(key, async () => {
            const scope = await this.createContainerScope(key);
            scope.onDispose(() => this.scopes.delete(key));
            return scope;
        });
    }

    protected async createContainerScope(key: T): Promise<ContainerScope> {
        const container = this.containerFactory();
        if (this.scopeBinding) {
            container.bind(this.scopeBinding).toConstantValue(key);
        }
        const modules = await Promise.all(this.containerScopeContribution.map(async contribution => {
            const mod = await contribution.getContainerModule();
            return 'default' in mod ? mod.default : mod;
        }));
        modules.forEach(mod => {
            if (mod) {
                container.load(mod);
            }
        });
        return new ContainerScopeImpl(container);
    }
}

export class ContainerScopeImpl implements ContainerScope {

    #container?: interfaces.Container;
    #onDisposeEmitter = new Emitter<void>();

    constructor(container: interfaces.Container) {
        this.#container = container;
        if (this.#container.isBound(ScopeLifecycle)) {
            this.#container.getAll(ScopeLifecycle).forEach(logError(element => element.initScope()));
        }
    }

    get container(): interfaces.Container {
        if (!this.#container) {
            throw new Error('this container scope is disposed!');
        }
        return this.#container;
    }

    get isDisposed(): boolean {
        return this.#container === undefined;
    }

    get onDispose(): Event<void> {
        return this.#onDisposeEmitter.event;
    }

    dispose(): void {
        if (!this.#container) {
            return;
        }
        if (this.#container.isBound(ScopeLifecycle)) {
            this.#container.getAll(ScopeLifecycle).forEach(logError(element => element.disposeScope()));
        }
        this.#container = undefined;
        this.#onDisposeEmitter.fire();
        this.#onDisposeEmitter.dispose();
    }
}

/**
 * Concurrency-safe map that handles asynchronous insertion.
 *
 * {@link getOrCreate} will return the same promise while it's pending.
 */
class AsyncDefaultMap<K, V> implements ReadonlyMap<K, V> {

    #resolved = new Map<K, V>();
    #pending = new Map<K, Promise<V>>();

    get size(): number {
        return this.#resolved.size;
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this.#resolved.entries();
    }

    get(key: K): V | undefined {
        return this.#resolved.get(key);
    }

    has(key: K): boolean {
        return this.#resolved.has(key);
    }

    delete(key: K): boolean {
        return this.#resolved.delete(key);
    }

    entries(): IterableIterator<[K, V]> {
        return this.#resolved.entries();
    }

    forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
        this.#resolved.forEach(callbackfn, thisArg);
    }

    keys(): IterableIterator<K> {
        return this.#resolved.keys();
    }

    values(): IterableIterator<V> {
        return this.#resolved.values();
    }

    async getAsync(key: K): Promise<V | undefined> {
        if (this.#resolved.has(key)) {
            return this.#resolved.get(key);
        }
        return this.#pending.get(key);
    }

    async create(key: K, create: () => Promise<V>): Promise<V> {
        if (this.#resolved.has(key)) {
            throw new Error(`a value for ${key} already exists`);
        }
        if (this.#pending.has(key)) {
            throw new Error(`value for ${key} is being created`);
        }
        return this.#createPending(key, create);
    }

    async getOrCreate(key: K, create: () => Promise<V>): Promise<V> {
        if (this.#resolved.has(key)) {
            return this.#resolved.get(key)!;
        }
        let pending = this.#pending.get(key);
        if (!pending) {
            pending = this.#createPending(key, create);
        }
        return pending;
    }

    async #createPending(key: K, create: () => Promise<V>): Promise<V> {
        const pending = create().then(
            value => {
                this.#resolved.set(key, value);
                this.#pending.delete(key);
                return value;
            },
            error => {
                this.#pending.delete(key);
                console.error(error);
                throw error;
            }
        );
        this.#pending.set(key, pending);
        return pending;
    }
}
