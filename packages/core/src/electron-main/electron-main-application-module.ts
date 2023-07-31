// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
import { v4 } from 'uuid';
import { ContainerScopeContribution, ContainerScopeManager, ElectronMainContext, ElectronWebContentsScope, RpcServerProvider } from '../common';
import { ContainerScopeManagerImpl } from '../common/container-scope-manager';
import { bindContributionProvider } from '../common/contribution-provider';
// eslint-disable-next-line max-len
import { ElectronApplication, ElectronClipboardService, ElectronKeyboardLayout, ElectronSecurityTokenApi, ElectronShell, ElectronWindow } from '../electron-common';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import { ElectronMainApplication, ElectronMainApplicationContribution, ElectronMainProcessArgv } from './electron-main-application';
import { ElectronSecurityTokenService } from './electron-security-token-service';
import { ElectronMainRpcContribution } from './messaging/electron-main-rpc-contribution';
import { TheiaIpcMain } from './messaging/ipc-main';
import { TheiaIpcMainImpl } from './messaging/ipc-main-impl';
import { ElectronApplicationServer } from './rpc-servers/electron-application-server';
import { ElectronClipboardServer } from './rpc-servers/electron-clipboard-server';
import { ElectronKeyboardLayoutServer } from './rpc-servers/electron-keyboard-layout-server';
import { ElectronShellServer } from './rpc-servers/electron-shell-server';
import { ElectronSecurityTokenServiceServer } from './rpc-servers/electron-token-server';
import { ElectronWindowServer } from './rpc-servers/electron-window-server';
import { TheiaBrowserWindowOptions, TheiaElectronWindow, TheiaElectronWindowFactory, WindowApplicationConfig } from './theia-electron-window';

const electronSecurityToken: ElectronSecurityToken = { value: v4() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any)[ElectronSecurityToken] = electronSecurityToken;

export default new ContainerModule(bind => {
    bind(TheiaIpcMain).to(TheiaIpcMainImpl).inSingletonScope();
    bind(ElectronMainApplication).toSelf().inSingletonScope();
    bind(ElectronSecurityToken).toConstantValue(electronSecurityToken);
    bind(ElectronSecurityTokenService).toSelf().inSingletonScope();

    bindContributionProvider(bind, ElectronMainApplicationContribution);

    bind(ElectronMainRpcContribution).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronMainRpcContribution);

    // #region rpc servers
    function bindRpcServer(context: symbol, proxyId: string, injectableRpcServer: interfaces.Newable<object>): void {
        bind(injectableRpcServer).toSelf().inSingletonScope();
        bind(RpcServerProvider)
            .toDynamicValue(ctx => path => path === proxyId && ctx.container.get(injectableRpcServer))
            .inSingletonScope()
            .whenTargetNamed(context);
    }
    bindRpcServer(ElectronMainContext, ElectronApplication, ElectronApplicationServer);
    bindRpcServer(ElectronMainContext, ElectronClipboardService, ElectronClipboardServer);
    bindRpcServer(ElectronMainContext, ElectronKeyboardLayout, ElectronKeyboardLayoutServer);
    bindRpcServer(ElectronMainContext, ElectronSecurityTokenApi, ElectronSecurityTokenServiceServer);
    bindRpcServer(ElectronMainContext, ElectronShell, ElectronShellServer);
    bindRpcServer(ElectronMainContext, ElectronWindow, ElectronWindowServer);
    // #endregion

    bind(ElectronMainProcessArgv).toSelf().inSingletonScope();

    bind(TheiaElectronWindow).toSelf();
    bind(TheiaElectronWindowFactory).toFactory(({ container }) => (options, config) => {
        const child = container.createChild();
        child.bind(TheiaBrowserWindowOptions).toConstantValue(options);
        child.bind(WindowApplicationConfig).toConstantValue(config);
        return child.get(TheiaElectronWindow);
    });

    bind(ContainerScopeManager)
        .toDynamicValue(ctx => new ContainerScopeManagerImpl(
            () => ctx.container.createChild(),
            ctx.container.getAllNamed(ContainerScopeContribution, ElectronWebContentsScope),
            ElectronWebContentsScope
        ))
        .inSingletonScope()
        .whenTargetNamed(ElectronWebContentsScope);
    bind(ContainerScopeContribution)
        .toConstantValue(new class MainWebContentsModule { getContainerModule = () => import('./web-contents-scope/web-contents-scope-module'); })
        .whenTargetNamed(ElectronWebContentsScope);
});
