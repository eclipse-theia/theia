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

import { CommandContribution, MessageService } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { MCPCommandContribution } from './ai-mcp-command-contribution';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { MCPServerManager, MCPServerManagerClient, MCPServerManagerPath } from '../common/mcp-server-manager';


export default new ContainerModule(bind => {
    bind(CommandContribution).to(MCPCommandContribution);
    bind(MCPServerManager).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const messageService = ctx.container.get(MessageService);
        const client: MCPServerManagerClient = {
            log: (message) => {
                messageService.info(message);
            }
        };
        return connection.createProxy<MCPServerManager>(MCPServerManagerPath, client);
    }).inSingletonScope();
});
