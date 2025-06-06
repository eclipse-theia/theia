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
import { bindContributionProvider } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import {
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from '@theia/core/lib/browser/messaging/service-connection-provider';
import { MCPToolFrontendDelegate, MCPToolDelegateClient, mcpToolDelegatePath } from '../common/mcp-tool-delegate';
import { MCPFrontendContributionRegistry } from './mcp-frontend-contribution-registry';
import { MCPFrontendContribution } from './mcp-frontend-contribution';
import { MCPToolDelegateClientImpl } from './mcp-tool-delegate-client';
import { SampleFrontendMCPContribution } from './sample-frontend-mcp-contribution';

export default new ContainerModule(bind => {
    // Bind the main frontend registry (equivalent to FrontendLanguageModelRegistryImpl)
    bind(MCPFrontendContributionRegistry).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MCPFrontendContributionRegistry);

    // Bind frontend client implementation that handles backend requests
    bind(MCPToolDelegateClient).to(MCPToolDelegateClientImpl).inSingletonScope();

    // Create proxy to backend delegate service
    bind(MCPToolFrontendDelegate).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get<MCPToolDelegateClient>(MCPToolDelegateClient);
        return connection.createProxy<MCPToolFrontendDelegate>(mcpToolDelegatePath, client);
    }).inSingletonScope();

    // Example frontend contributions (uncomment to enable)
    bind(SampleFrontendMCPContribution).toSelf().inSingletonScope();
    bind(MCPFrontendContribution).toService(SampleFrontendMCPContribution);

    // Bind contribution provider for frontend MCP contributions
    bindContributionProvider(bind, MCPFrontendContribution);
});
