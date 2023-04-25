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

import { ContainerModule } from 'inversify';
import { v4 } from 'uuid';
import { bindContributionProvider } from '../common/contribution-provider';
import { JsonRpcConnectionHandler } from '../common/messaging/proxy-factory';
import { FunctionUtils, MessagePortServer, TheiaIpcMain } from '../electron-common';
import { ElectronMainWindowService, electronMainWindowServicePath } from '../electron-common/electron-main-window-service';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import { ElectronConnectionHandler } from '../electron-common/messaging/electron-connection-handler';
import { ElectronClipboardMain } from './electron-clipboard-main';
import { ElectronCurrentWindowMain } from './electron-current-window-main';
import { ElectronFrontendApplicationMain } from './electron-frontend-application-main';
import { TheiaIpcMainImpl } from './electron-ipc-main-impl';
import { ElectronKeyboardLayoutMain } from './electron-keyboard-layout';
import { ElectronMainApplication, ElectronMainApplicationContribution, ElectronMainProcessArgv } from './electron-main-application';
import { ElectronMainWindowServiceImpl } from './electron-main-window-service-impl';
import { ElectronSecurityTokenService } from './electron-security-token-service';
import { ElectronShellMain } from './electron-shell-main';
import { ElectronSecurityTokenServiceMain } from './electron-token-main';
import { ElectronWindowsMain } from './electron-windows-main';
import { ElectronMessagingContribution } from './messaging/electron-messaging-contribution';
import { ElectronMessagingService } from './messaging/electron-messaging-service';
import { TheiaBrowserWindowOptions, TheiaElectronWindow, TheiaElectronWindowFactory, WindowApplicationConfig } from './theia-electron-window';
import { ElectronMessagePortServerMain } from './electron-message-port-server-main';

const electronSecurityToken: ElectronSecurityToken = { value: v4() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any)[ElectronSecurityToken] = electronSecurityToken;

export default new ContainerModule(bind => {
    bind(FunctionUtils).toSelf().inSingletonScope();
    bind(TheiaIpcMain).to(TheiaIpcMainImpl).inSingletonScope();
    bind(ElectronMainApplication).toSelf().inSingletonScope();
    bind(ElectronSecurityToken).toConstantValue(electronSecurityToken);
    bind(ElectronSecurityTokenService).toSelf().inSingletonScope();

    bindContributionProvider(bind, ElectronConnectionHandler);
    bindContributionProvider(bind, ElectronMessagingService.Contribution);
    bindContributionProvider(bind, ElectronMainApplicationContribution);

    bind(MessagePortServer).toService(ElectronMessagePortServerMain);

    bind(ElectronMessagePortServerMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronMessagePortServerMain);
    bind(ElectronMessagingContribution).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronMessagingContribution);
    bind(ElectronSecurityTokenServiceMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronSecurityTokenServiceMain);
    bind(ElectronCurrentWindowMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronCurrentWindowMain);
    bind(ElectronClipboardMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronClipboardMain);
    bind(ElectronFrontendApplicationMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronFrontendApplicationMain);
    bind(ElectronWindowsMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronWindowsMain);
    bind(ElectronShellMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronShellMain);
    bind(ElectronKeyboardLayoutMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronKeyboardLayoutMain);

    bind(ElectronMainWindowService).to(ElectronMainWindowServiceImpl).inSingletonScope();
    bind(ElectronConnectionHandler)
        .toDynamicValue(ctx => new JsonRpcConnectionHandler(electronMainWindowServicePath, () => ctx.container.get(ElectronMainWindowService)))
        .inSingletonScope();

    bind(ElectronMainProcessArgv).toSelf().inSingletonScope();

    bind(TheiaElectronWindow).toSelf();
    bind(TheiaElectronWindowFactory).toFactory(({ container }) => (options, config) => {
        const child = container.createChild();
        child.bind(TheiaBrowserWindowOptions).toConstantValue(options);
        child.bind(WindowApplicationConfig).toConstantValue(config);
        return child.get(TheiaElectronWindow);
    });
});
