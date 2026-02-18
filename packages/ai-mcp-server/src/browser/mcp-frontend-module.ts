// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
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
import { bindRootContributionProvider } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import {
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from '@theia/core/lib/browser/messaging/service-connection-provider';
import { MCPToolFrontendDelegate, MCPToolDelegateClient, mcpToolDelegatePath } from '../common/mcp-tool-delegate';
import { MCPFrontendBootstrap } from './mcp-frontend-bootstrap';
import { MCPFrontendContribution } from './mcp-frontend-contribution';
import { MCPToolDelegateClientImpl } from './mcp-tool-delegate-client';

export default new ContainerModule(bind => {
    bind(MCPFrontendBootstrap).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MCPFrontendBootstrap);

    bind(MCPToolDelegateClient).to(MCPToolDelegateClientImpl).inSingletonScope();

    bind(MCPToolFrontendDelegate).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get<MCPToolDelegateClient>(MCPToolDelegateClient);
        return connection.createProxy<MCPToolFrontendDelegate>(mcpToolDelegatePath, client);
    }).inSingletonScope();

    bindRootContributionProvider(bind, MCPFrontendContribution);
});
