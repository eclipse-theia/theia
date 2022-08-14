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

import { interfaces } from 'inversify';
import { Disposable, DisposableCollection } from './disposable';
import { serviceIdentifier } from './types';

/**
 * This is essentially a disposable wrapper around an Inversify `Container`.
 */
export interface ContainerScope extends Disposable {
    /**
     * Run the provided initialization callbacks.
     *
     * @throws if disposed.
     */
    initialize(initCallbacks?: ContainerScope.Init[]): this
    /**
     * @throws if disposed.
     */
    container(): interfaces.Container;
    /**
     * @throws if disposed.
     */
    dispose(): void
}
export namespace ContainerScope {

    export const Factory = serviceIdentifier<Factory>('ContainerScope.Factory');
    export type Factory = (container: interfaces.Container) => ContainerScope;

    /**
     * Callback to run once a {@link ContainerScope} is ready.
     *
     * Binding callbacks to this symbol will only work if part of a {@link ContainerScope}.
     */
    export const Init = serviceIdentifier<Init>('ContainerScope.Init');
    export type Init = (container: interfaces.Container) => Disposable | null | undefined | void;

    /**
     * Instances to dispose of once a {@link ContainerScope} is disposed.
     *
     * Binding disposables to this symbol will only work if part of a {@link ContainerScope}.
     */
    export const Destroy = serviceIdentifier<Disposable>('ContainerScope.Destroy');
    export type Destroy = Disposable | Disposable[];
}

/**
 * @internal
 */
export class DefaultContainerScope implements ContainerScope {

    protected _container?: interfaces.Container;
    protected disposables = new DisposableCollection();

    constructor(container: interfaces.Container) {
        this._container = container;
    }

    initialize(initCallbacks?: ContainerScope.Init[]): this {
        this.checkDisposed();
        initCallbacks?.forEach(callback => {
            const disposable = callback(this._container!);
            if (Disposable.is(disposable)) {
                this.disposables.push(disposable);
            }
        });
        return this;
    }

    container(): interfaces.Container {
        this.checkDisposed();
        return this._container!;
    }

    dispose(): void {
        const container = this.container();
        this._container = undefined;
        this.disposables.dispose();
        container.unbindAll();
    }

    protected checkDisposed(): void {
        if (!this._container) {
            throw new Error('container is disposed!');
        }
    }
}
