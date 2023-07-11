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
import { ContainerScopeContribution, ContainerScopeManager, ElectronMainContext, ElectronWebContentsScope, FunctionUtils } from '../common';
import { ContainerScopeManagerImpl } from '../common/container-scope-manager';
import { bindContributionProvider } from '../common/contribution-provider';
import { ElectronClipboardService, ElectronFrontendApplication, ElectronKeyboardLayout, ElectronSecurityTokenApi, ElectronShell, ElectronWindow } from '../electron-common';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import { ElectronFrontendApplicationMain } from './electron-application-main';
import { ElectronClipboardMain } from './electron-clipboard-main';
import { ElectronKeyboardLayoutMain } from './electron-keyboard-layout';
import { ElectronMainApplication, ElectronMainApplicationContribution, ElectronMainProcessArgv } from './electron-main-application';
import { ElectronSecurityTokenService } from './electron-security-token-service';
import { ElectronShellMain } from './electron-shell-main';
import { ElectronSecurityTokenServiceMain } from './electron-token-main';
import { ElectronWindowMain } from './electron-window-main';
import { TheiaIpcMain } from './messaging';
import { TheiaIpcMainImpl } from './messaging/ipc-main-impl';
import { TheiaBrowserWindowOptions, TheiaElectronWindow, TheiaElectronWindowFactory, WindowApplicationConfig } from './theia-electron-window';

const electronSecurityToken: ElectronSecurityToken = { value: v4() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any)[ElectronSecurityToken] = electronSecurityToken;

export default new ContainerModule(bind => {
    bind(FunctionUtils).toSelf().inSingletonScope();
    bind(TheiaIpcMain).to(TheiaIpcMainImpl).inSingletonScope();
    bind(ElectronMainApplication).toSelf().inSingletonScope();
    bind(ElectronSecurityToken).toConstantValue(electronSecurityToken);
    bind(ElectronSecurityTokenService).toSelf().inSingletonScope();

    bindContributionProvider(bind, ElectronMainApplicationContribution);

    function bindProxyHandler(context: symbol, expectedProxyId: string, targetBinding: interfaces.ServiceIdentifier<unknown>): void {
        bind(ProxyHandler)
            .toDynamicValue(ctx => proxyId => {
                if (proxyId === expectedProxyId) {
                    return ctx.container.get(targetBinding);
                }
            })
            .inSingletonScope()
            .whenTargetNamed(context);
    }
    bind(ElectronClipboardMain).toSelf().inSingletonScope();
    bindProxyHandler(ElectronMainContext, ElectronClipboardService, ElectronClipboardMain);
    bind(ElectronFrontendApplicationMain).toSelf().inSingletonScope();
    bindProxyHandler(ElectronMainContext, ElectronFrontendApplication, ElectronFrontendApplicationMain);
    bind(ElectronKeyboardLayoutMain).toSelf().inSingletonScope();
    bindProxyHandler(ElectronMainContext, ElectronKeyboardLayout, ElectronKeyboardLayoutMain);
    bind(ElectronSecurityTokenServiceMain).toSelf().inSingletonScope();
    bindProxyHandler(ElectronMainContext, ElectronSecurityTokenApi, ElectronSecurityTokenServiceMain);
    bind(ElectronShellMain).toSelf().inSingletonScope();
    bindProxyHandler(ElectronMainContext, ElectronShell, ElectronShellMain);
    bind(ElectronWindowMain).toSelf().inSingletonScope();
    bindProxyHandler(ElectronMainContext, ElectronWindow, ElectronWindowMain);

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
