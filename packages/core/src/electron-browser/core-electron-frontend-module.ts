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

import { ContainerModule, interfaces } from 'inversify';
import { TheiaIpcWindow } from '../browser';
import { ElectronMainContext, FrontendContext, ProxyProvider, RpcProxyProvider, RpcServerProvider } from '../common';
// eslint-disable-next-line max-len
import { ElectronApplication, ElectronClipboardService, ElectronFrontendApplication, ElectronKeyboardLayout, ElectronRpcSync, ElectronSecurityTokenApi, ElectronShell, ElectronWindow } from '../electron-common';
import { TheiaIpcWindowImpl } from '../browser/messaging/ipc-window-impl';
import { ElectronBrowserRpcProvider } from './messaging/electron-browser-rpc-provider';
import { ElectronBrowserRpcContribution } from './messaging/electron-browser-rpc-contribution';
import { ElectronFrontendApplicationServer } from './rpc-servers/electron-frontend-application-server';

/**
 * This symbol should be exposed from the preload context.
 */
declare const electronRpcSync: ElectronRpcSync;

export default new ContainerModule(bind => {
    // Singletons
    bind(ElectronRpcSync).toConstantValue(electronRpcSync);
    bind(TheiaIpcWindow).to(TheiaIpcWindowImpl).inSingletonScope();
    bind(ElectronBrowserRpcContribution).toSelf().inSingletonScope();
    bind(ElectronBrowserRpcProvider).toSelf().inSingletonScope();
    bind(ProxyProvider)
        .toDynamicValue(ctx => new RpcProxyProvider(ctx.container.get(ElectronBrowserRpcProvider)))
        .inSingletonScope()
        .whenTargetNamed(ElectronMainContext);
    // Proxies
    function bindProxy(context: symbol, proxyId: string): void {
        bind(proxyId)
            .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, context).getProxy(proxyId))
            .inSingletonScope();
    }
    bindProxy(ElectronMainContext, ElectronClipboardService);
    bindProxy(ElectronMainContext, ElectronApplication);
    bindProxy(ElectronMainContext, ElectronKeyboardLayout);
    bindProxy(ElectronMainContext, ElectronShell);
    bindProxy(ElectronMainContext, ElectronSecurityTokenApi);
    bindProxy(ElectronMainContext, ElectronWindow);
    // Servers
    function bindRpcServer(context: symbol, proxyId: string, injectableRpcServer: interfaces.Newable<object>): void {
        bind(injectableRpcServer).toSelf().inSingletonScope();
        bind(RpcServerProvider)
            .toDynamicValue(ctx => path => path === proxyId && ctx.container.get(injectableRpcServer))
            .inSingletonScope()
            .whenTargetNamed(context);
    }
    bindRpcServer(FrontendContext, ElectronFrontendApplication, ElectronFrontendApplicationServer);
});
