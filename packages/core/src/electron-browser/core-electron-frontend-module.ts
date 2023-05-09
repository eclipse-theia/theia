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
import { ElectronMainContext, Emitter, ProxyProvider, RpcEvent, RpcProxyProvider } from '../common';
import { ElectronCurrentWindow, FunctionUtils, MessagePortClient, TheiaIpcWindow } from '../electron-common';
import { TheiaIpcWindowImpl } from './electron-ipc-window-impl';
import { MessagePortClientImpl } from './electron-message-port-client-impl';

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
    bind(FunctionUtils).toSelf().inSingletonScope();
    bind(TheiaIpcWindow).to(TheiaIpcWindowImpl).inSingletonScope();
    bind(MessagePortClient).to(MessagePortClientImpl).inSingletonScope();
    bind(ProxyProvider)
        .toDynamicValue(ctx => {
            const electronMainRpc = ctx.container.get('electronMainRpc');
            return new RpcProxyProvider(electronMainRpc, electronMainRpc);
        })
        .inSingletonScope()
        .whenTargetNamed(ElectronMainContext);
    // Proxies
    bind(ElectronCurrentWindow)
        .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, ElectronMainContext).getProxy(ElectronCurrentWindow))
        .inSingletonScope();
});
