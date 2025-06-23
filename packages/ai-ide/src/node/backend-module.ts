// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { BrowserAutomation, browserAutomationPath, type BrowserAutomationClient } from '../common/browser-automation-protocol';
import { BrowserAutomationImpl } from './app-tester-agent/browser-automation-impl';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';

const browserAutomationModule = ConnectionContainerModule.create(({ bind, bindBackendService, bindFrontendService }) => {
    bind(BrowserAutomation).to(BrowserAutomationImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<BrowserAutomationClient>(browserAutomationPath, client => {
            const server = ctx.container.get<BrowserAutomationImpl>(BrowserAutomation);
            server.setClient(client);
            client.onDidCloseConnection(() => server.close());
            return server;
        })
    ).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(browserAutomationModule);

});
