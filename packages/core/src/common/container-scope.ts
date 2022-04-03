// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable, interfaces } from 'inversify';
import { Disposable, DisposableCollection } from './disposable';
import { serviceIdentifier } from './types';
import { Rc, RcFactory } from './reference-counter';

/**
 * This is essentially a disposable wrapper around an Inversify `Container`.
 */
export interface ContainerScope extends Disposable {
    /**
     * @throws if disposed.
     */
    container(): interfaces.Container;
    /**
     * @throws if disposed.
     */
    dispose(): void
}

export const ContainerScopeFactory = serviceIdentifier<ContainerScopeFactory>('ContainerScopeFactory');
export type ContainerScopeFactory = (container: interfaces.Container, callbacks?: ContainerScopeReady[]) => ContainerScope;

/**
 * Callback to run once a {@link ContainerScope} is ready.
 *
 * Binding callbacks to this symbol will only work if part of a {@link ContainerScope}.
 */
export const ContainerScopeReady = serviceIdentifier<ContainerScopeReady>('ContainerScopeReady');
export type ContainerScopeReady = (container: interfaces.Container) => Disposable | null | undefined | void;

export const ContainerScopeRegistry = serviceIdentifier<ContainerScopeRegistry>('ContainerScopeRegistry');
export interface ContainerScopeRegistry {
    getOrCreateScope(id: any): Rc<ContainerScope>
}

/**
 * @internal
 */
export class DefaultContainerScope implements ContainerScope {

    protected _container?: interfaces.Container;
    protected disposables = new DisposableCollection();

    constructor(container: interfaces.Container, callbacks: ContainerScopeReady[] = []) {
        this._container = container;
        callbacks.forEach(callback => {
            const disposable = callback(this._container!);
            if (Disposable.is(disposable)) {
                this.disposables.push(disposable);
            }
        });
    }

    container(): interfaces.Container {
        if (!this._container) {
            throw new Error('container is disposed!');
        }
        return this._container;
    }

    dispose(): void {
        const container = this.container();
        this._container = undefined;
        this.disposables.dispose();
        container.unbindAll();
    }
}

/**
 * @internal
 */
@injectable()
export class DefaultContainerScopeRegistry implements ContainerScopeRegistry {

    protected scopes = new Map<any, Rc<ContainerScope>>();
    protected containerFactory: () => interfaces.Container;

    @inject(RcFactory)
    protected rcFactory: RcFactory;

    @inject(ContainerScopeFactory)
    protected containerScopeFactory: ContainerScopeFactory;

    initialize(containerFactory: () => interfaces.Container): ContainerScopeRegistry {
        this.containerFactory = containerFactory;
        return this;
    }

    getOrCreateScope(id: any): Rc<ContainerScope> {
        let rc = this.scopes.get(id);
        if (rc) {
            return rc.clone();
        } else {
            const container = this.containerFactory();
            const containerScope = this.containerScopeFactory(container);
            rc = this.rcFactory(containerScope);
            this.scopes.set(id, rc);
            rc.onWillDisposeRef(() => {
                this.scopes.delete(id);
            });
            return rc;
        }
    }
}
