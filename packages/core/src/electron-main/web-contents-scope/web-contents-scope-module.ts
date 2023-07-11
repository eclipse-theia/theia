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
import { FrontendContext, ProxyId, ProxyProvider, RpcProxyProvider } from '../../common';
import { ElectronFrontendApplication } from '../../electron-common';
import { WebContentsRpcProvider } from './electron-web-contents-rpc-provider';

export default new ContainerModule(bind => {
    // Singletons
    bind(WebContentsRpcProvider).toSelf().inSingletonScope();
    bind(ProxyProvider)
        .toDynamicValue(ctx => new RpcProxyProvider(ctx.container.get(WebContentsRpcProvider)))
        .inSingletonScope()
        .whenTargetNamed(FrontendContext);
    // Proxies
    function bindProxy(context: string | symbol, proxyId: ProxyId<unknown>): void {
        bind(proxyId)
            .toDynamicValue(ctx => ctx.container.getNamed(ProxyProvider, context).getProxy(proxyId))
            .inSingletonScope();
    }
    bindProxy(FrontendContext, ElectronFrontendApplication);
});
