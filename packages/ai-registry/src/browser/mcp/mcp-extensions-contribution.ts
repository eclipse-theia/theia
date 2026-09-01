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

import { inject, injectable, postConstruct, named } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection, Emitter, Event, nls, PreferenceChange, PreferenceService, ILogger } from '@theia/core';
import { ContextMenuRenderer, HoverService } from '@theia/core/lib/browser';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { ExtensionsSourceContribution, SearchContext, SearchResult } from '@theia/vsx-registry/lib/browser/extensions-source-contribution';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/common/mcp-preferences';
import { MCPServerDescription } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { MCPServerInstallDialogFactory } from '@theia/ai-mcp/lib/browser/mcp-server-install-dialog';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { RegistrySearchFilter } from '../../common/registry-search-filter';
import { ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';
import { MCPInstallService } from './mcp-install-service';
import { MCPEntryHandlers, MCPInstalledEntry, MCPSearchResultEntry } from './mcp-entries';

@injectable()
export class MCPExtensionsContribution implements ExtensionsSourceContribution, Disposable {

    readonly type = 'mcp-server';
    readonly displayName = nls.localizeByDefault('MCP Servers');
    readonly searchToken = '@mcp';
    readonly priority = 100;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(MCPInstallService)
    protected readonly installService: MCPInstallService;

    @inject(RegistryFetchService)
    protected readonly fetchService: RegistryFetchService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    @inject(MCPServerInstallDialogFactory)
    protected readonly installDialogFactory: MCPServerInstallDialogFactory;

    @inject(RegistrySearchFilter)
    protected readonly searchFilter: RegistrySearchFilter;

    @inject(ILogger) @named('ai-registry:MCPExtensionsContribution')
    protected readonly logger: ILogger;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected handlers: MCPEntryHandlers;

    @postConstruct()
    protected init(): void {
        this.handlers = {
            install: entry => this.confirmAndInstall(entry),
            uninstall: serverKey => this.installService.uninstall(serverKey),
            unlink: serverKey => this.installService.unlink(serverKey),
            update: entry => this.installService.update(entry),
            link: entry => this.installService.link(entry),
            fixConfig: entry => this.installService.fixConfig(entry)
        };
        this.toDispose.push(this.preferenceService.onPreferenceChanged((change: PreferenceChange) => {
            if (change.preferenceName === MCP_SERVERS_PREF) {
                this.onDidChangeEmitter.fire();
            }
        }));
        this.toDispose.push(this.fetchService.onDidChange(() => this.onDidChangeEmitter.fire()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async resolveInstalled(): Promise<Iterable<TreeElement>> {
        const registryEntries = await this.safeGetRegistryEntries();
        const byServerId = new Map(registryEntries.map(e => [e.serverId, e]));
        const byName = new Map(registryEntries.map(e => [e.localName, e]));
        const result: TreeElement[] = [];
        for (const local of this.installService.listInstalledServers()) {
            if (this.isPluginOwned(local)) {
                continue;
            }
            const state = this.installService.classifyLocalServer(local, registryEntries);
            // Hand-added local servers belong to the MCP configuration widget, not this view.
            // Stale-linked entries (registryMetadata.serverId set but registry no longer lists
            // it) do belong here so we can surface the warning and offer Unlink / Uninstall.
            if (state.kind === 'installed-user-added') {
                continue;
            }
            const linkedId = local.registryMetadata?.serverId;
            const matchedEntry = (linkedId && byServerId.get(linkedId)) || byName.get(local.name);
            result.push(new MCPInstalledEntry(local, matchedEntry, state, this.handlers, this.hoverService, this.contextMenuRenderer));
        }
        return result;
    }

    async resolveSearchResults(query: string, context: SearchContext): Promise<Iterable<SearchResult>> {
        if (!query.trim()) {
            return [];
        }
        const registryEntries = await this.safeGetRegistryEntries();
        // Plugin-owned servers are withheld here too: `classifyRegistryEntry` compares stored
        // configs against registry entries, so a plugin's server could otherwise match a standalone
        // registry entry and make that entry claim to be installed.
        const localDescriptions = this.installService.listInstalledServers().filter(local => !this.isPluginOwned(local));
        const result: SearchResult[] = [];
        for (const entry of registryEntries) {
            // `verifiedOnly` comes from the OVSX-named `extensions.onlyShowVerifiedExtensions`
            // preference. In this contribution "verified" maps to `mcpRegistryVerified`
            // (i.e. approved in the AI registry), piggy-backing on the same toggle.
            if (context.verifiedOnly && !entry.mcpRegistryVerified) {
                continue;
            }
            // Pre-filter to genuine matches. The shared Extensions ranker fuzzy-matches scattered
            // characters across the combined searchable text, which - given long server descriptions
            // and reverse-DNS ids - otherwise treats almost every server as a hit (e.g. "asana"
            // matching every entry). The shared ranker still orders the survivors.
            if (!this.searchFilter.matches({ name: entry.name, identifier: entry.serverId, description: entry.description }, query)) {
                continue;
            }
            const searchableText = `${entry.name} ${entry.serverId} ${entry.description}`;
            const state = this.installService.classifyRegistryEntry(entry, localDescriptions, registryEntries);
            result.push({
                element: new MCPSearchResultEntry(entry, state, this.handlers, this.hoverService, this.contextMenuRenderer),
                searchableText
            });
        }
        return result;
    }

    async refresh(): Promise<void> {
        await this.fetchService.getEntries(true);
    }

    protected async safeGetRegistryEntries(): Promise<ResolvedRegistryEntry[]> {
        try {
            return await this.fetchService.getEntries();
        } catch (error) {
            // Without entries, locally-installed servers classify as user-added and the
            // MCP section shows nothing; users can still manage servers from the AI
            // configuration widget directly.
            this.logger.warn('AI registry fetch failed; MCP entries unavailable.', error);
            return [];
        }
    }

    /**
     * Whether the installed server belongs to an installed Agent Plugin.
     *
     * Such a server is a component of its plugin, installed and removed with it, so it must never
     * appear as a row of its own: the plugin is the single installed artifact the user manages.
     */
    protected isPluginOwned(local: MCPServerDescription): boolean {
        return local.registryMetadata?.pluginId !== undefined;
    }

    /**
     * Prompts the user for parameters the registry can't decide for them (autostart,
     * auth token) before writing the entry. Cancelling the dialog aborts the install.
     * The dialog is created through an injected factory so this contribution doesn't
     * import the DOM-touching `ReactDialog` chain directly.
     */
    protected async confirmAndInstall(entry: ResolvedRegistryEntry): Promise<void> {
        const dialog = this.installDialogFactory({
            name: entry.localName,
            autostart: true,
            // The registry sets `serverAuthToken` to mark auth as part of the connection
            // contract, even with no default value — so we check key presence, not value.
            requireAuthToken: 'serverAuthToken' in entry.config,
            // Likewise, an `oauth` block means the user must supply confidential-client credentials.
            requireOAuth: 'oauth' in entry.config
        });
        const result = await dialog.open();
        if (!result) {
            return;
        }
        await this.installService.install(entry, result);
    }
}
