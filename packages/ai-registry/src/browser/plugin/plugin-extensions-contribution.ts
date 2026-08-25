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

import { Disposable, DisposableCollection, Emitter, Event, ILogger, MessageService, nls } from '@theia/core';
import { ContextMenuRenderer, HoverService } from '@theia/core/lib/browser';
import { CoreMarkdownRenderer, MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ExtensionsSourceContribution, SearchContext, SearchResult } from '@theia/vsx-registry/lib/browser/extensions-source-contribution';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { RegistrySearchFilter } from '../../common/registry-search-filter';
import { ResolvedPluginEntry } from '../../common/plugin/plugin-registry-types';
import { PluginInstallClientImpl } from './plugin-install-client';
import { PluginInstallService } from './plugin-install-service';
import { PluginInstaller } from './plugin-installer';
import { PluginMcpRegistrar } from './plugin-mcp-registrar';
import { AGENT_PLUGINS_LABEL, PluginEntryHandlers, PluginInstalledEntry, PluginSearchResultEntry } from './plugin-entries';

/**
 * Agent Plugins section of the Extensions view. A plugin is exactly one row: its skills and servers
 * never appear as rows of their own, which would suggest they can be installed or removed alone.
 */
@injectable()
export class PluginExtensionsContribution implements ExtensionsSourceContribution, Disposable {

    readonly type = 'agent-plugin';
    readonly displayName = AGENT_PLUGINS_LABEL;
    readonly searchToken = '@agent-plugins';
    // Agent Plugins sort below skills (200), which sort below MCP servers and extensions.
    readonly priority = 300;

    @inject(PluginInstallService)
    protected readonly installService: PluginInstallService;

    @inject(PluginInstaller)
    protected readonly installer: PluginInstaller;

    @inject(PluginMcpRegistrar)
    protected readonly mcpRegistrar: PluginMcpRegistrar;

    @inject(RegistryFetchService)
    protected readonly fetchService: RegistryFetchService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    @inject(CoreMarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(PluginInstallClientImpl)
    protected readonly installClient: PluginInstallClientImpl;

    @inject(RegistrySearchFilter)
    protected readonly searchFilter: RegistrySearchFilter;

    @inject(ILogger) @named('ai-registry:PluginExtensionsContribution')
    protected readonly logger: ILogger;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected handlers: PluginEntryHandlers;

    @postConstruct()
    protected init(): void {
        this.handlers = {
            install: entry => this.runAction(
                () => this.installer.install(entry, { replaceExisting: false, confirm: true }),
                nls.localize('theia/ai-registry/plugin/installed', 'Installed Agent Plugin "{0}".', entry.name)),
            update: entry => this.runAction(
                () => this.installer.install(entry, { replaceExisting: true, confirm: false }),
                nls.localize('theia/ai-registry/plugin/updated', 'Updated Agent Plugin "{0}".', entry.name)),
            fixPlugin: entry => this.runAction(
                () => this.installer.install(entry, { replaceExisting: true, confirm: false }),
                nls.localize('theia/ai-registry/plugin/fixed', 'Restored Agent Plugin "{0}".', entry.name)),
            link: target => this.runAction(
                () => this.link(target.entry, target.directoryName),
                nls.localize('theia/ai-registry/plugin/linked', 'Linked Agent Plugin "{0}".', target.entry.name)
            ),
            unlink: pluginId => this.runAction(
                () => this.unlink(pluginId),
                nls.localize('theia/ai-registry/plugin/unlinked', 'Unlinked Agent Plugin "{0}".', pluginId)
            ),
            uninstall: pluginId => this.runAction(
                () => this.uninstall(pluginId),
                nls.localize('theia/ai-registry/plugin/uninstalled', 'Uninstalled Agent Plugin "{0}".', pluginId)
            )
        };
        this.toDispose.push(this.fetchService.onDidChange(() => this.onDidChangeEmitter.fire()));
        this.toDispose.push(this.installClient.onDidChangeInstalledPlugins(() => this.onDidChangeEmitter.fire()));
        this.toDispose.push(this.installClient.onDidStopWatching(() => this.promptWatcherReload()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async resolveInstalled(): Promise<Iterable<TreeElement>> {
        const installed = await this.installService.listInstalledPlugins();
        const registryEntries = await this.safeGetPluginEntries();
        const byPluginId = new Map(registryEntries.map(entry => [entry.pluginId, entry]));
        const result: TreeElement[] = [];
        for (const info of installed) {
            const state = this.installService.classifyInstalledPlugin(info, registryEntries);
            // Hand-placed directories belong to the user's own management, not this view.
            if (state.kind === 'installed-user-added') {
                continue;
            }
            const matchedEntry = (info.pluginId && byPluginId.get(info.pluginId))
                || registryEntries.find(entry => this.installService.findLinkDirectory(entry, [info]) !== undefined);
            result.push(new PluginInstalledEntry(info, matchedEntry, state, this.handlers, this.hoverService, this.markdownRenderer, this.contextMenuRenderer));
        }
        return result;
    }

    async resolveSearchResults(query: string, context: SearchContext): Promise<Iterable<SearchResult>> {
        if (!query.trim()) {
            return [];
        }
        const registryEntries = await this.safeGetPluginEntries();
        const installed = await this.installService.listInstalledPlugins();
        const result: SearchResult[] = [];
        for (const entry of registryEntries) {
            // The shared Extensions ranker fuzzy-matches scattered characters across the whole
            // searchable text, which given long descriptions makes almost every plugin a hit.
            // `context.verifiedOnly` is ignored as it is for skills: the feed has no such flag.
            if (!this.searchFilter.matches({ name: entry.name, identifier: entry.pluginId, description: entry.description }, query)) {
                continue;
            }
            const state = this.installService.classifyRegistryEntry(entry, installed);
            result.push({
                element: new PluginSearchResultEntry(entry, state, this.handlers, this.hoverService, this.markdownRenderer,
                    this.contextMenuRenderer, this.installService.findLinkDirectory(entry, installed)),
                searchableText: `${entry.name} ${entry.pluginId} ${entry.description}`
            });
        }
        return result;
    }

    async refresh(): Promise<void> {
        await this.fetchService.getPluginEntries(true);
    }

    /** Register after adopting, or a linked plugin's skills load while none of its servers start. */
    protected async link(entry: ResolvedPluginEntry, directoryName: string): Promise<void> {
        await this.mcpRegistrar.register(await this.installService.link(entry, directoryName));
    }

    // Both unregister first: once the root is gone, or no longer ours, entries naming it would linger.

    protected async uninstall(pluginId: string): Promise<void> {
        await this.mcpRegistrar.unregister(pluginId);
        await this.installService.uninstall(pluginId);
    }

    protected async unlink(pluginId: string): Promise<void> {
        await this.mcpRegistrar.unregister(pluginId);
        await this.installService.unlink(pluginId);
    }

    protected async promptWatcherReload(): Promise<void> {
        const reload = nls.localizeByDefault('Reload Window');
        const answer = await this.messageService.warn(
            nls.localize(
                'theia/ai-registry/plugin/watcherStopped',
                'Stopped watching the Agent Plugins folder for changes. Installed plugins may no longer refresh automatically. '
                + 'Reload the window to resume.'
            ),
            reload
        );
        if (answer === reload) {
            this.windowService.reload();
        }
    }

    protected async safeGetPluginEntries(): Promise<ResolvedPluginEntry[]> {
        try {
            return await this.fetchService.getPluginEntries();
        } catch (error) {
            this.logger.warn('AI registry fetch failed; Agent Plugin entries unavailable.', error);
            return [];
        }
    }

    /** `false` means the user cancelled a dialog, so nothing is reported. The view refreshes either way. */
    protected async runAction(action: () => Promise<boolean | void>, successMessage: string): Promise<void> {
        try {
            if (await action() !== false) {
                this.messageService.info(successMessage);
            }
        } catch (error) {
            this.messageService.error(error instanceof Error ? error.message : String(error));
        } finally {
            this.onDidChangeEmitter.fire();
        }
    }
}
