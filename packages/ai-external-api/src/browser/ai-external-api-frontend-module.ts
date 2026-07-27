// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { ContainerModule } from '@theia/core/shared/inversify';
import { EXTERNAL_CHAT_SESSION_PROVIDER_PATH, ExternalChatSessionBackendService, ExternalChatSessionProvider } from '../common/external-chat-session-provider';
import { AIExternalApiFrontendContribution } from './ai-external-api-frontend-contribution';
import { FrontendExternalChatSessionProvider } from './frontend-external-chat-session-provider';

export default new ContainerModule(bind => {
    bind(FrontendExternalChatSessionProvider).toSelf().inSingletonScope();
    bind(ExternalChatSessionProvider).toService(FrontendExternalChatSessionProvider);

    bind(ExternalChatSessionBackendService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const provider = ctx.container.get<ExternalChatSessionProvider>(ExternalChatSessionProvider);
        return connection.createProxy<ExternalChatSessionBackendService>(EXTERNAL_CHAT_SESSION_PROVIDER_PATH, provider);
    }).inSingletonScope();

    bind(AIExternalApiFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AIExternalApiFrontendContribution);
});
