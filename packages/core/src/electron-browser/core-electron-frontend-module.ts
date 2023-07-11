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

import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution, TheiaIpcWindow } from '../browser';
import { ElectronMainContext, Emitter, FunctionUtils, ProxyProvider, RpcEvent, RpcProxyProvider } from '../common';
// eslint-disable-next-line max-len
import { ElectronApplication, ElectronClipboardService, ElectronKeyboardLayout, ElectronRpcSync, ElectronSecurityTokenApi, ElectronShell, ElectronWindow } from '../electron-common';
import { TheiaIpcWindowImpl } from '../browser/messaging/ipc-window-impl';
import { ElectronBrowserRpcProvider } from './messaging/electron-browser-rpc-provider';

/**
 * This symbol should be exposed from the preload context.
 */
declare const electronRpcSync: ElectronRpcSync;

export default new ContainerModule(bind => {
    // Transients
    bind(RpcEvent).toDynamicValue(() => {
        const emitter = new Emitter();
        return Object.assign(emitter.event, {
            emit: (e: unknown) => emitter.fire(e),
            dispose: () => emitter.dispose()
        });
    });
    // Singletons
    bind(ElectronRpcSync).toConstantValue(electronRpcSync);
    bind(FunctionUtils).toSelf().inSingletonScope();
    bind(TheiaIpcWindow).to(TheiaIpcWindowImpl).inSingletonScope();
    bind(ElectronBrowserRpcProvider).toSelf().inSingletonScope();
    bind(ProxyProvider)
        .toDynamicValue(ctx => new RpcProxyProvider(ctx.container.get(ElectronBrowserRpcProvider)))
        .inSingletonScope()
        .whenTargetNamed(ElectronMainContext);
    bind(ElectronWebContentsRpc).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ElectronWebContentsRpc);
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
});
