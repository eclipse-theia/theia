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
import type { Disposable } from './disposable';
import type { Event } from './event';
import type { MaybeDefault, MaybePromise } from './types';

export interface ContainerScope extends Disposable {
    onDispose: Event<void>;
    readonly isDisposed: boolean;
    readonly container: interfaces.Container;
}

export const ScopeLifecycle = Symbol('ScopeLifecycle') as symbol & interfaces.Abstract<ScopeLifecycle>;
export interface ScopeLifecycle {
    initScope(): void;
    disposeScope(): void;
}

export const ContainerScopeContribution = Symbol('ContainerScopeContribution') as symbol & interfaces.Abstract<ContainerScopeContribution>;
export interface ContainerScopeContribution {
    getContainerModule(): MaybePromise<MaybeDefault<interfaces.ContainerModule>>;
}

export const ContainerScopeManager = Symbol('ContainerScopeManager') as symbol & interfaces.Abstract<ContainerScopeManager<unknown>>;
export interface ContainerScopeManager<T = unknown> {
    createScope(key: T): Promise<ContainerScope>;
    getScope(key: T): Promise<ContainerScope> | undefined;
    getAllScopes(): ReadonlyMap<T, Promise<ContainerScope>>;
    hasScope(key: T): boolean
}
