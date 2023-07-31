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

import type { interfaces } from 'inversify';
import { ContainerFactory } from './container-factory';
import { ContainerScope, ContainerScopeContribution, ContainerScopeManager, ScopeLifecycle } from './container-scope';
import { Emitter, Event } from './event';
import { logError } from './types';

export class ContainerScopeManagerImpl<T> implements ContainerScopeManager<T> {

    protected scopes = new Map<T, Promise<ContainerScope>>();

    constructor(
        protected containerFactory: ContainerFactory,
        protected containerScopeContribution: ContainerScopeContribution[],
        protected scopeBinding?: interfaces.ServiceIdentifier<T>
    ) { }

    async createScope(key: T): Promise<ContainerScope> {
        if (this.scopes.has(key)) {
            throw new Error(`scope already exists for ${key}`);
        }
        const scope = this.createContainerScope(key).then(s => {
            s.onDispose(() => this.scopes.delete(key));
            return s;
        });
        this.scopes.set(key, scope);
        return scope;
    }

    getScope(key: T): Promise<ContainerScope> | undefined {
        return this.scopes.get(key);
    }

    getAllScopes(): ReadonlyMap<T, Promise<ContainerScope>> {
        return this.scopes;
    }

    hasScope(key: T): boolean {
        return this.scopes.has(key);
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
