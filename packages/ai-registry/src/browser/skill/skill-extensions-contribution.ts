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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection, Emitter, Event, ILogger, MessageService, nls } from '@theia/core';
import { HoverService } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { ExtensionsSourceContribution, SearchContext, SearchResult } from '@theia/vsx-registry/lib/browser/extensions-source-contribution';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { ResolvedSkillEntry } from '../../common/skill/skill-registry-types';
import { SkillInstallService } from './skill-install-service';
import { SkillInstallClientImpl } from './skill-install-client';
import { SkillEntryHandlers, SkillInstalledEntry, SkillSearchResultEntry } from './skill-entries';

@injectable()
export class SkillExtensionsContribution implements ExtensionsSourceContribution, Disposable {

    readonly type = 'skill';
    readonly displayName = nls.localizeByDefault('Skills');
    // Skills sort below MCP servers (priority 100), which in turn sort below extensions.
    readonly priority = 200;

    @inject(SkillInstallService)
    protected readonly installService: SkillInstallService;

    @inject(RegistryFetchService)
    protected readonly fetchService: RegistryFetchService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(SkillInstallClientImpl)
    protected readonly installClient: SkillInstallClientImpl;

    @inject(ILogger) @named('ai-registry:SkillExtensionsContribution')
    protected readonly logger: ILogger;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected handlers: SkillEntryHandlers;

    @postConstruct()
    protected init(): void {
        this.handlers = {
            install: entry => this.runAction(
                () => this.installService.install(entry),
                nls.localize('theia/ai-registry/skill/installed', 'Installed skill "{0}".', entry.name)
            ),
            uninstall: name => this.runAction(
                () => this.installService.uninstall(name),
                nls.localize('theia/ai-registry/skill/uninstalled', 'Uninstalled skill "{0}".', name)
            ),
            unlink: name => this.runAction(
                () => this.installService.unlink(name),
                nls.localize('theia/ai-registry/skill/unlinked', 'Unlinked skill "{0}".', name)
            ),
            update: entry => this.runAction(
                () => this.installService.update(entry),
                nls.localize('theia/ai-registry/skill/updated', 'Updated skill "{0}".', entry.name)
            ),
            link: entry => this.runAction(
                () => this.installService.link(entry),
                nls.localize('theia/ai-registry/skill/linked', 'Linked skill "{0}".', entry.name)
            ),
            fixSkill: entry => this.runAction(
                () => this.installService.fixSkill(entry),
                nls.localize('theia/ai-registry/skill/fixed', 'Restored skill "{0}".', entry.name)
            )
        };
        this.toDispose.push(this.fetchService.onDidChange(() => this.onDidChangeEmitter.fire()));
        // The backend watches `~/.agents/skills` and pushes a change event when the folder
        // changes outside our own actions (manual edits, external installs/removals).
        this.toDispose.push(this.installClient.onDidChangeInstalledSkills(() => this.onDidChangeEmitter.fire()));
        // The backend stops its watcher after an irrecoverable watcher error; live refreshes
        // are then lost until the window is reloaded, so prompt the user to do so.
        this.toDispose.push(this.installClient.onDidStopWatching(() => this.promptWatcherReload()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async resolveInstalled(): Promise<Iterable<TreeElement>> {
        const installed = await this.installService.listInstalledSkills();
        const registryEntries = await this.safeGetSkillEntries();
        const bySkillId = new Map(registryEntries.map(entry => [entry.skillId, entry]));
        const byName = new Map(registryEntries.map(entry => [entry.name, entry]));
        const result: TreeElement[] = [];
        for (const info of installed) {
            const state = this.installService.classifyInstalledSkill(info, registryEntries);
            // Hand-added skills with no registry counterpart belong to the user's own
            // management, not this view.
            if (state.kind === 'installed-user-added') {
                continue;
            }
            const matchedEntry = (info.skillId && bySkillId.get(info.skillId)) || byName.get(info.name);
            result.push(new SkillInstalledEntry(info, matchedEntry, state, this.handlers, this.hoverService));
        }
        return result;
    }

    async resolveSearchResults(query: string, context: SearchContext): Promise<Iterable<SearchResult>> {
        if (!query.trim()) {
            return [];
        }
        const registryEntries = await this.safeGetSkillEntries();
        const installed = await this.installService.listInstalledSkills();
        const result: SearchResult[] = [];
        for (const entry of registryEntries) {
            const state = this.installService.classifyRegistryEntry(entry, installed);
            result.push({
                element: new SkillSearchResultEntry(entry, state, this.handlers, this.hoverService),
                searchableText: `${entry.name} ${entry.skillId} ${entry.description}`
            });
        }
        return result;
    }

    async refresh(): Promise<void> {
        await this.fetchService.getSkillEntries(true);
    }

    /**
     * Warns the user that automatic skill refreshes stopped (the backend watcher failed) and
     * offers to reload the window, which restarts the watcher.
     */
    protected async promptWatcherReload(): Promise<void> {
        const reload = nls.localizeByDefault('Reload Window');
        const answer = await this.messageService.warn(
            nls.localize(
                'theia/ai-registry/skill/watcherStopped',
                'Stopped watching the skills folder for changes. Installed skills may no longer refresh automatically. Reload the window to resume.'
            ),
            reload
        );
        if (answer === reload) {
            this.windowService.reload();
        }
    }

    protected async safeGetSkillEntries(): Promise<ResolvedSkillEntry[]> {
        try {
            return await this.fetchService.getSkillEntries();
        } catch (error) {
            this.logger.warn('AI registry fetch failed; skill entries unavailable.', error);
            return [];
        }
    }

    /**
     * Runs a mutation action, reporting success or failure via the message service and
     * refreshing the view once it settles. Kept here (rather than in the entries) so the
     * view stays in sync with on-disk state after every action.
     */
    protected async runAction(action: () => Promise<void>, successMessage: string): Promise<void> {
        try {
            await action();
            this.messageService.info(successMessage);
        } catch (error) {
            this.messageService.error(error instanceof Error ? error.message : String(error));
        } finally {
            this.onDidChangeEmitter.fire();
        }
    }
}
