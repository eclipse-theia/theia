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

import '../../src/browser/style/mcp-entries.css';
import '../../src/browser/style/skill-entries.css';
import '../../src/browser/style/plugin-entries.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, MenuContribution, PreferenceContribution } from '@theia/core';
import { FrontendApplicationContribution, RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ExtensionsSourceContribution } from '@theia/vsx-registry/lib/browser/extensions-source-contribution';
import { MCPRegistryUiBridge } from '@theia/ai-mcp/lib/browser/mcp-registry-ui-bridge';
import { AgentPluginUiBridge } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { SkillRegistryUiBridge } from '@theia/ai-core/lib/browser/skill-registry-ui-bridge';
import { SkillDirectoryContribution } from '@theia/ai-core/lib/browser/skill-service';
import { AIRegistryConfiguration } from '../common/ai-registry-configuration.js';
import { AIRegistryPreferencesSchema } from '../common/ai-registry-preferences.js';
import { MCPRegistryEntryResolver, MCPRegistryEntryResolverImpl } from '../common/mcp/mcp-registry-entry-resolver.js';
import { RegistryFetchService, RegistryFetchServiceImpl } from '../common/registry-fetch-service.js';
import { RegistrySearchFilter } from '../common/registry-search-filter.js';
import { SkillRegistryEntryResolver, SkillRegistryEntryResolverImpl } from '../common/skill/skill-registry-entry-resolver.js';
import { PluginRegistryEntryResolver, PluginRegistryEntryResolverImpl } from '../common/plugin/plugin-registry-entry-resolver.js';
import { SkillInstallBackendService, SkillInstallBackendServicePath, SkillInstallClient } from '../common/skill/skill-install-protocol.js';
import { SkillRegistryPreferencesSchema } from '../common/skill/skill-registry-preferences.js';
import { MCPInstallService, MCPInstallServiceImpl } from './mcp/mcp-install-service.js';
import { MCPExtensionsContribution } from './mcp/mcp-extensions-contribution.js';
import { MCPRegistryUiBridgeImpl } from './mcp/mcp-registry-ui-bridge-impl.js';
import { SkillInstallService, SkillInstallServiceImpl } from './skill/skill-install-service.js';
import { SkillInstallClientImpl } from './skill/skill-install-client.js';
import { SkillExtensionsContribution } from './skill/skill-extensions-contribution.js';
import { InstallSkillUriConfiguration } from './skill/install-skill-uri-configuration.js';
import { InstallSkillUriHandler } from './skill/install-skill-uri-handler.js';
import {
    PluginInstallBackendService,
    PluginInstallBackendServicePath,
    PluginInstallClient
} from '../common/plugin/plugin-install-protocol.js';
import { PluginDirectoryNaming, PluginDirectoryNamingImpl } from '../common/plugin/plugin-directory-naming.js';
import { PluginInstallService, PluginInstallServiceImpl } from './plugin/plugin-install-service.js';
import { PluginInstallClientImpl } from './plugin/plugin-install-client.js';
import { PluginExtensionsContribution } from './plugin/plugin-extensions-contribution.js';
import {
    PluginHashMismatchDialog,
    PluginHashMismatchDialogFactory,
    PluginHashMismatchDialogOptions,
    PluginInstallDialog,
    PluginInstallDialogFactory,
    PluginInstallDialogOptions
} from './plugin/plugin-install-dialog.js';
import { PluginInstaller, PluginInstallerImpl } from './plugin/plugin-installer.js';
import { PluginMcpRegistrar, PluginMcpRegistrarImpl } from './plugin/plugin-mcp-registrar.js';
import { PluginMcpReconciler } from './plugin/plugin-mcp-reconciler.js';
import { PluginSkillDirectoryContribution } from './plugin/plugin-skill-directory-contribution.js';
import { AgentPluginUiBridgeImpl } from './plugin/agent-plugin-ui-bridge-impl.js';
import { SkillRegistryUiBridgeImpl } from './skill/skill-registry-ui-bridge-impl.js';
import { InstallPluginUriConfiguration } from './plugin/install-plugin-uri-configuration.js';
import { InstallPluginUriHandler } from './plugin/install-plugin-uri-handler.js';
import { AIRegistryToolbarContribution } from './ai-registry-toolbar-contribution.js';
import { AIRegistryMenuContribution } from './ai-registry-menu-contribution.js';
import { RegistryAutoUpdatePolicy, RegistryAutoUpdatePolicyImpl } from './auto-update/registry-auto-update-policy.js';
import { RegistryAutoUpdateService } from './auto-update/registry-auto-update-service.js';
import { RegistryAutoUpdateContribution } from './auto-update/registry-auto-update-contribution.js';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(AIRegistryConfiguration).toSelf().inSingletonScope();
    bind(MCPRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(MCPRegistryEntryResolver).toService(MCPRegistryEntryResolverImpl);
    bind(SkillRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(SkillRegistryEntryResolver).toService(SkillRegistryEntryResolverImpl);
    bind(PluginRegistryEntryResolverImpl).toSelf().inSingletonScope();
    bind(PluginRegistryEntryResolver).toService(PluginRegistryEntryResolverImpl);
    bind(RegistryFetchServiceImpl).toSelf().inSingletonScope();
    bind(RegistryFetchService).toService(RegistryFetchServiceImpl);
    bind(RegistrySearchFilter).toSelf().inSingletonScope();
    bind(MCPInstallServiceImpl).toSelf().inSingletonScope();
    bind(MCPInstallService).toService(MCPInstallServiceImpl);

    bind(MCPExtensionsContribution).toSelf().inSingletonScope();
    bind(ExtensionsSourceContribution).toService(MCPExtensionsContribution);

    bind(MCPRegistryUiBridgeImpl).toSelf().inSingletonScope();
    bind(MCPRegistryUiBridge).toService(MCPRegistryUiBridgeImpl);

    bind(PreferenceContribution).toConstantValue({ schema: SkillRegistryPreferencesSchema });
    bind(SkillInstallClientImpl).toSelf().inSingletonScope();
    bind(SkillInstallClient).toService(SkillInstallClientImpl);
    bind(SkillInstallBackendService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return connection.createProxy<SkillInstallBackendService>(SkillInstallBackendServicePath, ctx.container.get(SkillInstallClientImpl));
    }).inSingletonScope();
    bind(SkillInstallServiceImpl).toSelf().inSingletonScope();
    bind(SkillInstallService).toService(SkillInstallServiceImpl);

    bind(SkillExtensionsContribution).toSelf().inSingletonScope();
    bind(ExtensionsSourceContribution).toService(SkillExtensionsContribution);

    bind(InstallSkillUriConfiguration).toSelf().inSingletonScope();
    bind(InstallSkillUriHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(InstallSkillUriHandler);

    bind(PluginInstallClientImpl).toSelf().inSingletonScope();
    bind(PluginInstallClient).toService(PluginInstallClientImpl);
    bind(PluginInstallBackendService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return connection.createProxy<PluginInstallBackendService>(PluginInstallBackendServicePath, ctx.container.get(PluginInstallClientImpl));
    }).inSingletonScope();
    // Shared with the backend, so that the directory a plugin may be adopted under is the same one an
    // install would have created.
    bind(PluginDirectoryNamingImpl).toSelf().inSingletonScope();
    bind(PluginDirectoryNaming).toService(PluginDirectoryNamingImpl);
    bind(PluginInstallServiceImpl).toSelf().inSingletonScope();
    bind(PluginInstallService).toService(PluginInstallServiceImpl);
    bind(PluginInstallDialogFactory).toFactory(() => (options: PluginInstallDialogOptions) => new PluginInstallDialog(options));
    bind(PluginHashMismatchDialogFactory).toFactory(() => (options: PluginHashMismatchDialogOptions) => new PluginHashMismatchDialog(options));

    bind(PluginSkillDirectoryContribution).toSelf().inSingletonScope();
    bind(SkillDirectoryContribution).toService(PluginSkillDirectoryContribution);
    bind(PluginMcpRegistrarImpl).toSelf().inSingletonScope();
    bind(PluginMcpRegistrar).toService(PluginMcpRegistrarImpl);
    bind(PluginMcpReconciler).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(PluginMcpReconciler);
    // Sits above the install service rather than inside it: the install flow registers the plugin's
    // components once the download is committed, and the registrar has to be able to list the
    // installed plugins to do that, so folding the flow into the install service would close a cycle.
    bind(PluginInstallerImpl).toSelf().inSingletonScope();
    bind(PluginInstaller).toService(PluginInstallerImpl);

    bind(PluginExtensionsContribution).toSelf().inSingletonScope();
    bind(ExtensionsSourceContribution).toService(PluginExtensionsContribution);

    bind(AgentPluginUiBridgeImpl).toSelf().inSingletonScope();
    // Nothing binds the bridge without this package, which is what makes every Agent Plugin
    // affordance disappear from the AI configuration widgets there.
    bind(AgentPluginUiBridge).toService(AgentPluginUiBridgeImpl);

    bind(SkillRegistryUiBridgeImpl).toSelf().inSingletonScope();
    // As above, for skills this package installs or links directly rather than through a plugin.
    bind(SkillRegistryUiBridge).toService(SkillRegistryUiBridgeImpl);

    bind(InstallPluginUriConfiguration).toSelf().inSingletonScope();
    bind(InstallPluginUriHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(InstallPluginUriHandler);

    bind(AIRegistryToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(AIRegistryToolbarContribution);

    bind(PreferenceContribution).toConstantValue({ schema: AIRegistryPreferencesSchema });
    bind(RegistryAutoUpdatePolicyImpl).toSelf().inSingletonScope();
    bind(RegistryAutoUpdatePolicy).toService(RegistryAutoUpdatePolicyImpl);
    bind(RegistryAutoUpdateService).toSelf().inSingletonScope();
    bind(RegistryAutoUpdateContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(RegistryAutoUpdateContribution);

    bind(AIRegistryMenuContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AIRegistryMenuContribution);
    bind(MenuContribution).toService(AIRegistryMenuContribution);
});
