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
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendChatDelegateClient, LanguageModelProvider, ModelProviderFrontendDelegate, frontendChatDelegatePath } from '../common';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { FrontendLanguageModelProvider } from './frontend-language-model-provider';
import { FrontendChatDelegateClientImpl } from './frontend-chat-delegate-client';

export default new ContainerModule(bind => {
    bind(FrontendLanguageModelProvider).toSelf().inSingletonScope();
    bind(FrontendChatDelegateClientImpl).toSelf().inSingletonScope();
    bind(FrontendChatDelegateClient).toService(FrontendChatDelegateClientImpl);
    bind(ModelProviderFrontendDelegate).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get<FrontendChatDelegateClient>(FrontendChatDelegateClient);
        return connection.createProxy<ModelProviderFrontendDelegate>(frontendChatDelegatePath, client);
    }).inSingletonScope();
    bind(LanguageModelProvider).toService(FrontendLanguageModelProvider);
});
