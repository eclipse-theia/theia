/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { JsonRpcConnectionHandler } from '@theia/core/lib/common/messaging/proxy-factory';
import { ElectronSecurityToken } from '@theia/core/lib/electron-common/electron-token';
import { ContainerModule } from 'inversify';
import { v4 } from 'uuid';
import { ElectronMainWindowService, electronMainWindowServicePath } from '../electron-common/electron-window-protocol';
import { ElectronApplication, ElectronMainContribution, ProcessArgv } from './electron-application';
import { DefaultElectronMainWindowService } from './electron-window-service';
import { ElectronMessagingContribution } from './messaging/electron-messaging-contribution';
import { ElectronMessagingService } from './messaging/electron-messaging-service';
import { ElectronConnectionHandler } from '../electron-common/messaging/electron-connection-handler';

const electronSecurityToken: ElectronSecurityToken = { value: v4() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any)[ElectronSecurityToken] = electronSecurityToken;

export default new ContainerModule(bind => {
    bind(ElectronApplication).toSelf().inSingletonScope();
    bind(ElectronMessagingContribution).toSelf().inSingletonScope();
    bind(ElectronSecurityToken).toConstantValue(electronSecurityToken);

    bindContributionProvider(bind, ElectronConnectionHandler);
    bindContributionProvider(bind, ElectronMessagingService.Contribution);
    bindContributionProvider(bind, ElectronMainContribution);

    bind(ElectronMainContribution).toService(ElectronMessagingContribution);

    bind(ElectronMainWindowService).to(DefaultElectronMainWindowService).inSingletonScope();
    bind(ElectronConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler(electronMainWindowServicePath,
            () => context.container.get(ElectronMainWindowService))
    ).inSingletonScope();

    bind(ProcessArgv).toSelf().inSingletonScope();
});
