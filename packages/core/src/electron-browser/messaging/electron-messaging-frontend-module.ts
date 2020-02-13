/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import * as electron from 'electron';
import { interfaces, ContainerModule } from 'inversify';
import { DeferredSync } from '../../common/promise-util';
import { ElectronSecurityToken, ElectronSecurityTokenChannels } from '../../electron-common/electron-token';
import { FrontendApplicationContribution } from '../../browser/frontend-application';
import { WebSocketConnectionProvider } from '../../browser/messaging/ws-connection-provider';
import { ElectronWebSocketConnectionProvider } from './electron-ws-connection-provider';

export const messagingFrontendModule = new ContainerModule(bind => {
    bind<ElectronSecurityToken>(ElectronSecurityToken).toConstantValue().inSingletonScope();
    bind(ElectronWebSocketConnectionProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ElectronWebSocketConnectionProvider);
    bind(WebSocketConnectionProvider).toService(ElectronWebSocketConnectionProvider);
});

/**
 * Factory for the deferred value of the ElectronSecurityToken.
 */
export function ElectronSecurityTokenRequestFactory(ctx: interfaces.Context): DeferredSync<ElectronSecurityToken> {

    // Attach a one-time listener to get the response for our token request:
    const tokenRequest = new DeferredSync<ElectronSecurityToken>();

    // Fool-guard:
    const timeout = setTimeout(() => {
        tokenRequest.reject(new Error('electron token timeout'));
    }, 5000);

    // Backend should answer our token request:
    electron.ipcRenderer.once(ElectronSecurityTokenChannels.Response, (event: electron.Event, response: ElectronSecurityToken) => {
        clearTimeout(timeout);
        tokenRequest.resolve(response);
    });

    // Send token request:
    electron.ipcRenderer.send(ElectronSecurityTokenChannels.Request);

    return tokenRequest;
}
