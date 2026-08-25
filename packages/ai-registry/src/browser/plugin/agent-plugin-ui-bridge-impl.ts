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

import { Emitter, Event, ILogger } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { AgentPluginUiBridge, InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { VSXExtensionsContribution } from '@theia/vsx-registry/lib/browser/vsx-extensions-contribution';
import { VSXExtensionsSearchModel } from '@theia/vsx-registry/lib/browser/vsx-extensions-search-model';
import { PluginInstallClientImpl } from './plugin-install-client';
import { PluginInstallService } from './plugin-install-service';

/**
 * Lets the AI configuration widgets label and reveal the plugin that supplied a skill or server,
 * without `@theia/ai-core` or `@theia/ai-mcp` depending on this package. Cached because
 * {@link getPlugin} is called from React renders and must answer synchronously.
 */
@injectable()
export class AgentPluginUiBridgeImpl implements AgentPluginUiBridge {

    @inject(PluginInstallService)
    protected readonly installService: PluginInstallService;

    @inject(PluginInstallClientImpl)
    protected readonly installClient: PluginInstallClientImpl;

    @inject(VSXExtensionsContribution)
    protected readonly viewContribution: VSXExtensionsContribution;

    @inject(VSXExtensionsSearchModel)
    protected readonly searchModel: VSXExtensionsSearchModel;

    @inject(ILogger) @named('ai-registry:AgentPluginUiBridgeImpl')
    protected readonly logger: ILogger;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected plugins = new Map<string, InstalledAgentPluginInfo>();
    /** Keyed by the qualifier a contributed skill root carries, which is not the plugin identifier. */
    protected pluginsByQualifier = new Map<string, InstalledAgentPluginInfo>();

    @postConstruct()
    protected init(): void {
        this.installClient.onDidChangeInstalledPlugins(() => this.refreshCache());
        // Primed eagerly, or the first render shows no provenance until something changes.
        this.refreshCache();
    }

    getPlugin(pluginId: string): InstalledAgentPluginInfo | undefined {
        return this.plugins.get(pluginId);
    }

    getPluginByQualifier(qualifier: string): InstalledAgentPluginInfo | undefined {
        return this.pluginsByQualifier.get(qualifier);
    }

    revealPlugin(pluginId: string): void {
        if (!this.plugins.has(pluginId)) {
            // Nothing to reveal; an empty search would just hide what the user was looking at.
            return;
        }
        this.searchModel.query = pluginId;
        this.viewContribution.openView({ activate: true }).catch(error =>
            this.logger.warn(`Could not open the Extensions view to reveal the Agent Plugin "${pluginId}".`, error));
    }

    protected async refreshCache(): Promise<void> {
        try {
            const installed = await this.installService.listInstalledPlugins();
            const next = new Map<string, InstalledAgentPluginInfo>();
            const byQualifier = new Map<string, InstalledAgentPluginInfo>();
            for (const info of installed) {
                if (info.pluginId !== undefined) {
                    const plugin = { pluginId: info.pluginId, name: info.name ?? info.pluginId };
                    next.set(info.pluginId, plugin);
                    byQualifier.set(info.qualifier ?? info.directoryName, plugin);
                }
            }
            this.plugins = next;
            this.pluginsByQualifier = byQualifier;
            this.onDidChangeEmitter.fire();
        } catch (error) {
            // Left as-is: a stale label beats dropping every affordance over one failed call.
            this.logger.warn('Could not list installed Agent Plugins; plugin provenance may be out of date.', error);
        }
    }
}
