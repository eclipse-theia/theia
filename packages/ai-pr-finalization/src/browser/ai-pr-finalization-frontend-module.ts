// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { AIVariableContribution, Agent } from '@theia/ai-core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AiPRFinalizationAgent } from './ai-pr-finalization-agent';
import {
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from '@theia/core/lib/browser/messaging/service-connection-provider';
import { GitShellService, gitShellServicePath } from '../common/git-shell-service-protocol';
import { GitCommandContribution } from './git-commands';
import { CommandContribution } from '@theia/core';
import { GitVariableContribution } from './ai-pr-finalization-variables';
import { AiPrFinalizationContribution } from './ai-pr-finalization-contribution';
import { ChatAgent } from '@theia/ai-chat';

export default new ContainerModule(bind => {
    bind(AiPRFinalizationAgent).toSelf().inSingletonScope();
    bind(Agent).toService(AiPRFinalizationAgent);
    bind(ChatAgent).toService(AiPRFinalizationAgent);

    bind(GitCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(GitCommandContribution);

    bind(GitShellService).toDynamicValue(
        ctx => {
            const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
            return connection.createProxy<GitShellService>(gitShellServicePath);
        }
    );

    bind(AIVariableContribution).to(GitVariableContribution).inSingletonScope();

    bind(AiPrFinalizationContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AiPrFinalizationContribution);
});
