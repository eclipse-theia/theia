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

import { CommandContribution, Emitter, Event, PreferenceContribution } from '@theia/core';
import { FrontendApplicationContribution, RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    CHATGPT_AUTH_SERVICE_PATH,
    CHATGPT_LANGUAGE_MODELS_MANAGER_PATH,
    ChatGptAuthService,
    ChatGptAuthServiceClient,
    ChatGptAuthState,
    ChatGptLanguageModelsManager,
    ChatGptPreferencesSchema
} from '../common';
import { ChatGptCommandContribution } from './chatgpt-command-contribution';
import { ChatGptFrontendApplicationContribution } from './chatgpt-frontend-application-contribution';

class ChatGptAuthServiceClientImpl implements ChatGptAuthServiceClient {
    protected readonly onAuthStateChangedEmitter = new Emitter<ChatGptAuthState>();
    readonly onAuthStateChangedEvent: Event<ChatGptAuthState> = this.onAuthStateChangedEmitter.event;
    onAuthStateChanged(state: ChatGptAuthState): void {
        this.onAuthStateChangedEmitter.fire(state);
    }
}

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: ChatGptPreferencesSchema });
    bind(ChatGptFrontendApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ChatGptFrontendApplicationContribution);
    bind(ChatGptCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChatGptCommandContribution);
    bind(ChatGptLanguageModelsManager).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<ChatGptLanguageModelsManager>(CHATGPT_LANGUAGE_MODELS_MANAGER_PATH);
    }).inSingletonScope();
    bind(ChatGptAuthServiceClientImpl).toConstantValue(new ChatGptAuthServiceClientImpl());
    bind(ChatGptAuthServiceClient).toService(ChatGptAuthServiceClientImpl);
    bind(ChatGptAuthService).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get(ChatGptAuthServiceClientImpl);
        const proxy = provider.createProxy<ChatGptAuthService>(CHATGPT_AUTH_SERVICE_PATH, client);
        // The RPC proxy cannot carry a Theia `Event`, so the client's local emitter is substituted for it.
        return new Proxy(proxy, {
            get(target: ChatGptAuthService, property: string | symbol, receiver: unknown): unknown {
                if (property === 'onAuthStateChanged') {
                    return client.onAuthStateChangedEvent;
                }
                return Reflect.get(target, property, receiver);
            }
        }) as ChatGptAuthService;
    }).inSingletonScope();
});
