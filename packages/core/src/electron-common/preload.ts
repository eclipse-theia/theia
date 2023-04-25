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

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { interfaces } from 'inversify';

const serviceIdentifiers = new Set<string>();

export const PRELOAD_SERVICE_PREFIX = 'theia.preload.serviceIdentifier:';

/**
 * Implement this interface and bind to this service identifier to contribute
 * to the Electron preload context bootstrap.
 */
export const ElectronPreloadContribution = Symbol('ElectronPreloadContribution') as symbol & interfaces.Abstract<ElectronPreloadContribution>;
export interface ElectronPreloadContribution {
    preload(): void
}

/**
 * Please use {@link bindPreloadApi} instead of directly binding to this.
 *
 * Strings bound to this identifier will be used to expose services from the
 * Electron preload context to the Electron browser context.
 */
export const TheiaPreloadApi = Symbol('TheiaPreloadApi') as symbol & interfaces.Abstract<TheiaPreloadApi>;
export type TheiaPreloadApi = string;

/**
 * Wrapper around Electron's {@link ContextBridge} that can expose instances
 * with proxyable prototypes.
 */
export const TheiaContextBridge = Symbol('TheiaContextBridge') as symbol & interfaces.Abstract<TheiaContextBridge>;
export interface TheiaContextBridge {
    exposeInMainWorld(apiKey: string, api: unknown): void
}

/**
 * This component lives in the Electron preload context and is exposed as
 * `theiaPreloadContext` in the Electron browser context's global scope. It
 * allows to make the bridge between the preload and browser contexts.
 */
export const TheiaPreloadContext = Symbol('TheiaPreloadContext') as symbol & interfaces.Abstract<TheiaPreloadContext>;
export interface TheiaPreloadContext {
    getAllPreloadApis(): [serviceIdentifier: string, service: object][]
}

/**
 * Use this function to create string identifier for your preload Inversify
 * components. Symbols cannot be passed accross Electron/JS contexts.
 */
export function preloadServiceIdentifier<T>(serviceIdentifier: string): string & interfaces.Abstract<T> {
    serviceIdentifier = `${PRELOAD_SERVICE_PREFIX}${serviceIdentifier}`;
    if (serviceIdentifiers.has(serviceIdentifier)) {
        console.warn(`a service identifier was already defined: ${serviceIdentifier}`);
    } else {
        serviceIdentifiers.add(serviceIdentifier);
    }
    return serviceIdentifier as any;
}

export function isPreloadServiceIdentifier(serviceIdentifier: interfaces.ServiceIdentifier<unknown>): boolean {
    return typeof serviceIdentifier === 'string' && serviceIdentifier.startsWith(PRELOAD_SERVICE_PREFIX);
}

/**
 * Exposes the {@link serviceIdentifier} binding to the Electron browser
 * context and bind your own component to it in the Electron preload context.
 *
 * @example
 *
 * bindPreloadApi(bind, 'myPreloadApi').to(MyPreloadApiImpl).inSingletonScope();
 * bindPreloadApi(bind, 'myDynamicApi').toDynamicValue(ctx => ...).inSingletonScope();
 */
export function bindPreloadApi<T>(bind: interfaces.Bind, serviceIdentifier: string | string & interfaces.Abstract<T>): interfaces.BindingToSyntax<T> {
    bind(TheiaPreloadApi).toConstantValue(serviceIdentifier);
    return bind(serviceIdentifier);
}
