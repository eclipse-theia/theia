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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { interfaces, ContainerModule } from 'inversify';
import { RpcProxyFactory, ConnectionHandler, RpcConnectionHandler, RpcConnectionHandlerOptions, RpcProxy } from '../../common/index.js';

export type BindFrontendService = <T extends object>(path: string, serviceIdentifier: interfaces.ServiceIdentifier<T>) => interfaces.BindingWhenOnSyntax<T>;
export type BindBackendService = <T extends object, C extends object = object>(
    path: string, serviceIdentifier: interfaces.ServiceIdentifier<T>, onActivation?: (service: T, proxy: RpcProxy<C>) => T,
    options?: RpcConnectionHandlerOptions<T>
) => void;
export type ConnectionContainerModuleCallBack = (registry: {
    bind: interfaces.Bind
    unbind: interfaces.Unbind
    isBound: interfaces.IsBound
    rebind: interfaces.Rebind
    bindFrontendService: BindFrontendService
    bindBackendService: BindBackendService
}) => void;

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
 * A backend service is held until the environment of the user's login shell is known, unless it is declared independent of it,
 * see `ConnectionHandler.independentOfShellEnvironment`:
 * ```ts
 * const myConnectionModule3 = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
 *   bind(MyStartupService).toSelf().inSingletonScope();
 *   bindBackendService(myStartupServicePath, MyStartupService, undefined, { independentOfShellEnvironment: true });
 * });
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
export const ConnectionContainerModule: symbol & { create(callback: ConnectionContainerModuleCallBack): ContainerModule } = Object.assign(Symbol('ConnectionContainerModule'), {
    create(callback: ConnectionContainerModuleCallBack): ContainerModule {
        return new ContainerModule((bind, unbind, isBound, rebind) => {
            const bindFrontendService: BindFrontendService = (path, serviceIdentifier) => {
                const serviceFactory = new RpcProxyFactory();
                const service = serviceFactory.createProxy();
                bind<ConnectionHandler>(ConnectionHandler).toConstantValue({
                    path,
                    // the backend only calls the frontend through this channel, so there is nothing to hold
                    independentOfShellEnvironment: true,
                    onConnection: connection => serviceFactory.listen(connection)
                });
                return bind(serviceIdentifier).toConstantValue(service as any);
            };
            const bindBackendService: BindBackendService = (path, serviceIdentifier, onActivation, options) => {
                bind(ConnectionHandler).toDynamicValue(context =>
                    new RpcConnectionHandler<any>(path, proxy => {
                        const service = context.container.get(serviceIdentifier);
                        return onActivation ? onActivation(service, proxy) : service;
                    }, options)
                ).inSingletonScope();
            };
            callback({ bind, unbind, isBound, rebind, bindFrontendService, bindBackendService });
        });
    }
});
