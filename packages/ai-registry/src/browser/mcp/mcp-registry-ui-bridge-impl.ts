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

import { Emitter, Event } from '@theia/core';
import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { MCPRegistryUiBridge } from '@theia/ai-mcp/lib/browser/mcp-registry-ui-bridge';
import { MCPInstallEntry } from '@theia/ai-mcp/lib/browser/mcp-server-editor';
import { VSXExtensionsViewContainer } from '@theia/vsx-registry/lib/browser/vsx-extensions-view-container';
import { VSXExtensionsSearchModel } from '@theia/vsx-registry/lib/browser/vsx-extensions-search-model';
import { ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';
import { RegistryFetchService } from '../../common/registry-fetch-service';

@injectable()
export class MCPRegistryUiBridgeImpl implements MCPRegistryUiBridge {

    @inject(RegistryFetchService)
    protected readonly fetchService: RegistryFetchService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(VSXExtensionsSearchModel)
    protected readonly searchModel: VSXExtensionsSearchModel;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected knownServerIds = new Set<string>();
    protected entriesByServerId = new Map<string, ResolvedRegistryEntry>();

    /** Resolves after `refreshCache` has run for the first time, success or failure. */
    protected readonly readyDeferred = new Deferred<void>();

    @postConstruct()
    protected init(): void {
        // Re-sync our id cache whenever the registry data changes (initial load, refresh).
        this.fetchService.onDidChange(() => this.refreshCache());
        // Prime the cache eagerly so the very first `hasServer` check after the UI mounts
        // returns the right answer instead of erring on the side of "still unknown".
        this.refreshCache();
    }

    ready(): Promise<void> {
        return this.readyDeferred.promise;
    }

    hasServer(serverId: string): boolean {
        return this.knownServerIds.has(serverId);
    }

    getInstallEntry(serverId: string): MCPInstallEntry | undefined {
        const entry = this.entriesByServerId.get(serverId);
        if (!entry) {
            return undefined;
        }
        return {
            localName: entry.localName,
            config: { ...entry.config },
            serverId: entry.serverId,
            ...(entry.version !== undefined && { version: entry.version }),
            ...(entry.configHash !== undefined && { configHash: entry.configHash })
        };
    }

    async openRegistry(serverId?: string): Promise<void> {
        // Pre-populate the search only for known-good ids so the entry is in focus when
        // the view opens. For revoked ids the server appears in the Installed section
        // (with a warning + Unlink / Uninstall); jumping to an empty search hides it, so
        // we just show the view and let the user see the warning in Installed.
        if (serverId && this.hasServer(serverId)) {
            this.searchModel.query = serverId;
        }
        // Reveal-and-activate rather than toggle: a second click on "Browse AI registry"
        // must keep the view visible, not collapse it again.
        const widget = await this.widgetManager.getOrCreateWidget(VSXExtensionsViewContainer.ID);
        await this.shell.revealWidget(widget.id);
        await this.shell.activateWidget(widget.id);
    }

    protected async refreshCache(): Promise<void> {
        try {
            const entries = await this.fetchService.getEntries();
            const next = new Set(entries.map(entry => entry.serverId));
            // Refresh the per-id lookup table regardless of whether the id set itself
            // changed - the *contents* of an entry (config, configHash) may have moved
            // even when the id list is unchanged, and `getInstallEntry` callers expect
            // the latest values.
            this.entriesByServerId = new Map(entries.map(entry => [entry.serverId, entry]));
            if (!areSetsEqual(next, this.knownServerIds)) {
                this.knownServerIds = next;
                this.onDidChangeEmitter.fire();
            }
        } catch {
            // Leave the cache as-is on failure; surfaced errors are the fetch service's job.
        } finally {
            // Signal readiness regardless of outcome - failed fetch is still a "we tried".
            this.readyDeferred.resolve();
        }
    }
}

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const value of a) {
        if (!b.has(value)) {
            return false;
        }
    }
    return true;
}
