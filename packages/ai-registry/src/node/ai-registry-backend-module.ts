// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { ConnectionHandler, PreferenceContribution, RpcConnectionHandler } from '@theia/core';
import { BackendRequestAllowedContribution } from '@theia/core/lib/node';
import { AIRegistryConfiguration } from '../common/ai-registry-configuration';
import { AgentPluginManifestReader } from '../common/plugin/agent-plugin-manifest';
import { PluginDirectoryNaming, PluginDirectoryNamingImpl } from '../common/plugin/plugin-directory-naming';
import { PluginInstallBackendService, PluginInstallBackendServicePath, PluginInstallClient } from '../common/plugin/plugin-install-protocol';
import { SkillInstallBackendService, SkillInstallBackendServicePath, SkillInstallClient } from '../common/skill/skill-install-protocol';
import { SkillRegistryPreferencesSchema } from '../common/skill/skill-registry-preferences';
import { AIRegistryRequestAllowedContribution } from './ai-registry-request-allowed-contribution';
import { GitHubTarballSource, GitHubTarballSourceImpl } from './github-tarball-source';
import { PluginInstallBackendServiceImpl } from './plugin-install-backend-service';
import { SkillInstallBackendServiceImpl } from './skill-install-backend-service';

export default new ContainerModule(bind => {
    bind(AIRegistryConfiguration).toSelf().inSingletonScope();
    bind(AIRegistryRequestAllowedContribution).toSelf().inSingletonScope();
    bind(BackendRequestAllowedContribution).toService(AIRegistryRequestAllowedContribution);

    bind(PreferenceContribution).toConstantValue({ schema: SkillRegistryPreferencesSchema });
    bind(SkillInstallBackendServiceImpl).toSelf().inSingletonScope();
    bind(SkillInstallBackendService).toService(SkillInstallBackendServiceImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<SkillInstallClient>(SkillInstallBackendServicePath, client => {
            const server = ctx.container.get<SkillInstallBackendServiceImpl>(SkillInstallBackendService);
            server.setClient(client);
            client.onDidCloseConnection(() => server.disconnectClient(client));
            return server;
        })
    ).inSingletonScope();

    bind(AgentPluginManifestReader).toSelf().inSingletonScope();
    // Shared with the frontend, so that the directory a plugin may be adopted under is the same one an
    // install would have created.
    bind(PluginDirectoryNamingImpl).toSelf().inSingletonScope();
    bind(PluginDirectoryNaming).toService(PluginDirectoryNamingImpl);
    bind(GitHubTarballSourceImpl).toSelf().inSingletonScope();
    bind(GitHubTarballSource).toService(GitHubTarballSourceImpl);
    bind(PluginInstallBackendServiceImpl).toSelf().inSingletonScope();
    bind(PluginInstallBackendService).toService(PluginInstallBackendServiceImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<PluginInstallClient>(PluginInstallBackendServicePath, client => {
            const server = ctx.container.get<PluginInstallBackendServiceImpl>(PluginInstallBackendService);
            server.setClient(client);
            client.onDidCloseConnection(() => server.disconnectClient(client));
            return server;
        })
    ).inSingletonScope();
});
