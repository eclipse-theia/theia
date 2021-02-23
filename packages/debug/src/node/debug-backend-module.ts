/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { bindContributionProvider, ILogger } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    DebugPath,
    DebugService
} from '../common/debug-service';
import {
    LaunchBasedDebugAdapterFactory,
    DebugAdapterSessionFactoryImpl
} from './debug-adapter-factory';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import {
    DebugAdapterContribution,
    DebugAdapterSessionFactory,
    DebugAdapterFactory
} from '../common/debug-model';
import { DebugServiceImpl } from './debug-service-impl';
import { DebugAdapterContributionRegistry } from './debug-adapter-contribution-registry';
import { DebugAdapterSessionManager } from './debug-adapter-session-manager';

const debugConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindContributionProvider(bind, DebugAdapterContribution);
    bind(DebugAdapterContributionRegistry).toSelf().inSingletonScope();

    bind(DebugService).to(DebugServiceImpl).inSingletonScope();
    bindBackendService(DebugPath, DebugService);
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(debugConnectionModule);

    bind(DebugAdapterSessionFactory).to(DebugAdapterSessionFactoryImpl).inSingletonScope();
    bind(DebugAdapterFactory).to(LaunchBasedDebugAdapterFactory).inSingletonScope();
    bind(DebugAdapterSessionManager).toSelf().inSingletonScope();
    bind(MessagingService.Contribution).toService(DebugAdapterSessionManager);

    bind(ILogger).toDynamicValue(({ container }) =>
        container.get<ILogger>(ILogger).child('debug')
    ).inSingletonScope().whenTargetNamed('debug');
});
