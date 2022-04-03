// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { ContainerModule, interfaces } from 'inversify';
import { BackendAndFrontend, Disposable, ProxyProvider, ServiceContribution, serviceIdentifier } from '../../common';
import Route = require('route-parser');

export type BindFrontendService = <T extends object>(path: string, serviceIdentifier: interfaces.ServiceIdentifier<T>) => interfaces.BindingOnSyntax<T>;
export type BindBackendService = <T extends object>(
    path: string, serviceIdentifier: interfaces.ServiceIdentifier<T>, onActivation?: (service: T) => T
) => void;
export type ConnectionContainerModuleCallBack = (registry: {
    bind: interfaces.Bind
    unbind: interfaces.Unbind
    isBound: interfaces.IsBound
    rebind: interfaces.Rebind
    bindFrontendService: BindFrontendService
    bindBackendService: BindBackendService
}) => void;

export namespace ConnectionContainerModuleApi {

    export function create(callback: ConnectionContainerModuleCallBack): ContainerModule {
        return new ContainerModule((bind, unbind, isBound, rebind) => {
            const bindFrontendService: BindFrontendService = (path, identifier) => bind<any>(identifier)
                .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, BackendAndFrontend).getProxy(path))
                .inSingletonScope()
                .whenTargetNamed(BackendAndFrontend);
            const bindBackendService: BindBackendService = (path, identifier, onActivation) => {
                const route = new Route(path);
                bind(ServiceContribution)
                    .toDynamicValue(ctx => (serviceId, params, lifecycle) => {
                        const match = route.match(serviceId);
                        if (match) {
                            let service: any = ctx.container.get(identifier);
                            if (Disposable.is(service)) {
                                service = lifecycle.track(service).ref();
                            }
                            return onActivation?.(service) ?? service;
                        }
                    })
                    .inSingletonScope()
                    .whenTargetNamed(BackendAndFrontend);
            };
            callback({ bind, unbind, isBound, rebind, bindFrontendService, bindBackendService });
        });
    }
}

/**
 * ### Connection Container Module
 *
 * It provides bindings which are scoped per a connection, e.g.
 * in order to allow backend services to access frontend service within the same connection.
 *
 * #### Binding a frontend service
 * ```ts
 * const myConnectionModule = ConnectionContainerModule.create(({ bindFrontendService }) => {
 *   bindFrontendService(myFrontendServicePath, MyFrontendService);
 * });
 *
 * export const myBackendApplicationModule = new ContainerModule(bind => {
 *   bind(ConnectionContainerModule).toConstantValue(myConnectionModule);
 * }
 * ```
 *
 * #### Exposing a backend service
 * ```ts
 * const myConnectionModule2 = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
 *   bind(MyBackendService).toSelf().inSingletonScope();
 *   bindBackendService(myBackendServicePath, MyBackendService);
 * });
 *
 * export const myBackendApplicationModule2 = new ContainerModule(bind => {
 *   bind(ConnectionContainerModule).toConstantValue(myConnectionModule2);
 * }
 * ```
 *
 * #### Injecting a frontend service
 * ```ts
 * @injectable()
 * export class MyBackendService {
 *     @inject(MyFrontendService)
 *     protected readonly myFrontendService: MyFrontendService;
 * }
 * ```
 */
export const ConnectionContainerModule = Object.assign(
    serviceIdentifier<ContainerModule>('ConnectionContainerModule'),
    ConnectionContainerModuleApi
);
