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

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, Emitter, Event, nls, PreferenceContribution } from '@theia/core';
import {
    FrontendApplicationContribution,
    RemoteConnectionProvider,
    ServiceConnectionProvider
} from '@theia/core/lib/browser';
import {
    CopilotLanguageModelsManager,
    COPILOT_LANGUAGE_MODELS_MANAGER_PATH,
    CopilotAuthService,
    COPILOT_AUTH_SERVICE_PATH,
    CopilotAuthServiceClient,
    CopilotAuthState
} from '../common';
import { CopilotPreferencesSchema } from '../common/copilot-preferences';
import { CopilotFrontendApplicationContribution } from './copilot-frontend-application-contribution';
import { CopilotCommandContribution } from './copilot-command-contribution';
import { CopilotStatusBarContribution } from './copilot-status-bar-contribution';
import { CopilotAuthDialog, CopilotAuthDialogProps } from './copilot-auth-dialog';

class CopilotAuthServiceClientImpl implements CopilotAuthServiceClient {
    protected readonly onAuthStateChangedEmitter = new Emitter<CopilotAuthState>();
    readonly onAuthStateChangedEvent: Event<CopilotAuthState> = this.onAuthStateChangedEmitter.event;
    onAuthStateChanged(state: CopilotAuthState): void {
        this.onAuthStateChangedEmitter.fire(state);
    }
}

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: CopilotPreferencesSchema });

    bind(CopilotCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(CopilotCommandContribution);

    bind(CopilotStatusBarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CopilotStatusBarContribution);

    bind(CopilotAuthDialogProps).toConstantValue({
        title: nls.localize('theia/ai/copilot/commands/signIn', 'Sign in to GitHub Copilot')
    });
    bind(CopilotAuthDialog).toSelf().inSingletonScope();

    bind(CopilotFrontendApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CopilotFrontendApplicationContribution);

    bind(CopilotAuthServiceClientImpl).toConstantValue(new CopilotAuthServiceClientImpl());
    bind(CopilotAuthServiceClient).toService(CopilotAuthServiceClientImpl);

    bind(CopilotLanguageModelsManager).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<CopilotLanguageModelsManager>(COPILOT_LANGUAGE_MODELS_MANAGER_PATH);
    }).inSingletonScope();

    bind(CopilotAuthService).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const clientImpl = ctx.container.get(CopilotAuthServiceClientImpl);
        const proxy = provider.createProxy<CopilotAuthService>(COPILOT_AUTH_SERVICE_PATH, clientImpl);
        return new Proxy(proxy, {
            get(target: CopilotAuthService, prop: string | symbol, receiver: unknown): unknown {
                if (prop === 'onAuthStateChanged') {
                    return clientImpl.onAuthStateChangedEvent;
                }
                return Reflect.get(target, prop, receiver);
            }
        }) as CopilotAuthService;
    }).inSingletonScope();
});
