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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { generateUuid } from '../common/uuid';
import { bindContributionProvider } from '../common/contribution-provider';
import { RpcConnectionHandler } from '../common/messaging/proxy-factory';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import { ElectronMainWindowService, electronMainWindowServicePath } from '../electron-common/electron-main-window-service';
import { ElectronMainApplication, ElectronMainApplicationContribution, ElectronMainProcessArgv } from './electron-main-application';
import { ElectronMainWindowServiceImpl } from './electron-main-window-service-impl';
import { TheiaBrowserWindowOptions, TheiaElectronWindow, TheiaElectronWindowFactory, WindowApplicationConfig } from './theia-electron-window';
import { TheiaMainApi } from './electron-api-main';
import { ElectronMessagingContribution } from './messaging/electron-messaging-contribution';
import { ElectronSecurityTokenService } from './electron-security-token-service';
import { ElectronMessagingService } from './messaging/electron-messaging-service';
import { ElectronConnectionHandler } from './messaging/electron-connection-handler';

const electronSecurityToken: ElectronSecurityToken = { value: generateUuid() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any)[ElectronSecurityToken] = electronSecurityToken;

export default new ContainerModule(bind => {
    bind(ElectronMainApplication).toSelf().inSingletonScope();
    bind(ElectronMessagingContribution).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ElectronMessagingContribution);
    bind(ElectronSecurityToken).toConstantValue(electronSecurityToken);
    bind(ElectronSecurityTokenService).toSelf().inSingletonScope();

    bindContributionProvider(bind, ElectronConnectionHandler);
    bindContributionProvider(bind, ElectronMessagingService.Contribution);
    bindContributionProvider(bind, ElectronMainApplicationContribution);

    bind(TheiaMainApi).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(TheiaMainApi);

    bind(ElectronMainWindowService).to(ElectronMainWindowServiceImpl).inSingletonScope();
    bind(ElectronConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler(electronMainWindowServicePath,
            () => context.container.get(ElectronMainWindowService))
    ).inSingletonScope();

    bind(ElectronMainProcessArgv).toSelf().inSingletonScope();

    bind(TheiaElectronWindow).toSelf();
    bind(TheiaElectronWindowFactory).toFactory(({ container }) => (options, config) => {
        const child = container.createChild();
        child.bind(TheiaBrowserWindowOptions).toConstantValue(options);
        child.bind(WindowApplicationConfig).toConstantValue(config);
        return child.get(TheiaElectronWindow);
    });
});
