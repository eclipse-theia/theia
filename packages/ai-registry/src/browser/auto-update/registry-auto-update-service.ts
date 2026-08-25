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

import { CommandService, ILogger, MessageService, nls } from '@theia/core';
import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { VSXExtensionsCommands } from '@theia/vsx-registry/lib/browser/vsx-extension-commands';
import { AUTO_UPDATE_PREF, AutoUpdateMode, RegistryArtifactKind } from '../../common/ai-registry-preferences';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { MCPInstallService } from '../mcp/mcp-install-service';
import { PluginInstallService } from '../plugin/plugin-install-service';
import { PluginInstaller } from '../plugin/plugin-installer';
import { SkillInstallService } from '../skill/skill-install-service';
import { RegistryAutoUpdatePolicy } from './registry-auto-update-policy';

/** A single artifact that has a newer registry entry and is not opted out of updating. */
export interface PendingUpdate {
    kind: RegistryArtifactKind;
    label: string;
    mode: AutoUpdateMode;
    /** Message shown when this artifact alone is offered for update. */
    promptMessage: string;
    /** Message shown when this artifact alone was updated. */
    successMessage: string;
    apply(): Promise<void>;
}

/**
 * Checks the registry for updates to installed skills, MCP servers and Agent Plugins and applies
 * or offers them according to the effective {@link RegistryAutoUpdatePolicy}.
 *
 * Drifted artifacts are deliberately excluded in every mode: they classify as `fix-skill` /
 * `fix-config` / `fix-plugin` rather than `installed-from-registry`, so they never reach
 * {@link collectPending} and the user resolves them with Fix in the Extensions view.
 *
 * Updates go through the install services directly rather than the contributions' action
 * handlers, so a batch reports one summary message instead of one message per artifact.
 */
@injectable()
export class RegistryAutoUpdateService {

    @inject(RegistryFetchService)
    protected readonly fetchService: RegistryFetchService;

    @inject(SkillInstallService)
    protected readonly skillInstallService: SkillInstallService;

    @inject(MCPInstallService)
    protected readonly mcpInstallService: MCPInstallService;

    @inject(PluginInstallService)
    protected readonly pluginInstallService: PluginInstallService;

    @inject(PluginInstaller)
    protected readonly pluginInstaller: PluginInstaller;

    @inject(RegistryAutoUpdatePolicy)
    protected readonly policy: RegistryAutoUpdatePolicy;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(ILogger) @named('ai-registry:RegistryAutoUpdateService')
    protected readonly logger: ILogger;

    /**
     * Runs one update pass. Never rejects - a registry that cannot be reached is logged and
     * otherwise ignored, since a failed fetch is not evidence that anything needs updating.
     */
    async check(): Promise<void> {
        let pending: PendingUpdate[];
        try {
            pending = await this.collectPending();
        } catch (error) {
            this.logger.warn('AI registry auto-update check skipped: could not resolve registry entries.', error);
            return;
        }
        const automatic = pending.filter(update => update.mode === 'on');
        const toAsk = pending.filter(update => update.mode === 'ask');
        if (automatic.length > 0) {
            await this.applyAll(automatic);
        }
        if (toAsk.length > 0) {
            const applied = await this.promptPending(toAsk);
            // Only once the user has dealt with that notification, so the two decisions never
            // compete for attention. Anything still outstanding is carried over, so turning auto
            // update on there applies it instead of leaving it for the next window load.
            await this.promptForDefault(applied ? [] : toAsk);
        }
    }

    /**
     * Resolves every installed artifact that has an update available and is not set to `off`.
     * Forces a registry refresh first - the cached response would not surface anything new.
     */
    protected async collectPending(): Promise<PendingUpdate[]> {
        // One refresh serves every slice: `getEntries(true)` refetches the shared response and
        // invalidates all the caches, so the calls below resolve against it.
        const mcpEntries = await this.fetchService.getEntries(true);
        const skillEntries = await this.fetchService.getSkillEntries();
        const pluginEntries = await this.fetchService.getPluginEntries();
        const pending: PendingUpdate[] = [];

        for (const info of await this.skillInstallService.listInstalledSkills()) {
            const state = this.skillInstallService.classifyInstalledSkill(info, skillEntries);
            if (state.kind !== 'installed-from-registry' || !state.updateAvailable) {
                continue;
            }
            const entry = skillEntries.find(candidate => candidate.skillId === info.skillId);
            if (!entry) {
                continue;
            }
            const mode = this.policy.getMode('skill', entry.skillId);
            if (mode === 'off') {
                continue;
            }
            pending.push({
                kind: 'skill',
                label: entry.name,
                mode,
                promptMessage: nls.localize('theia/ai-registry/autoUpdate/skillAvailable', 'Skill "{0}" has an update available.', entry.name),
                successMessage: nls.localize('theia/ai-registry/skill/updated', 'Updated skill "{0}".', entry.name),
                apply: () => this.skillInstallService.update(entry)
            });
        }

        for (const local of this.mcpInstallService.listInstalledServers()) {
            const state = this.mcpInstallService.classifyLocalServer(local, mcpEntries);
            if (state.kind !== 'installed-from-registry' || !state.updateAvailable) {
                continue;
            }
            const entry = mcpEntries.find(candidate => candidate.serverId === local.registryMetadata?.serverId);
            if (!entry) {
                continue;
            }
            const mode = this.policy.getMode('mcp', entry.serverId);
            if (mode === 'off') {
                continue;
            }
            pending.push({
                kind: 'mcp',
                label: entry.name,
                mode,
                promptMessage: nls.localize('theia/ai-registry/autoUpdate/mcpAvailable', 'MCP server "{0}" has an update available.', entry.name),
                successMessage: nls.localize('theia/ai-registry/mcp/updated', 'Updated MCP server "{0}".', entry.name),
                apply: () => this.mcpInstallService.update(entry)
            });
        }

        for (const info of await this.pluginInstallService.listInstalledPlugins()) {
            const state = this.pluginInstallService.classifyInstalledPlugin(info, pluginEntries);
            if (state.kind !== 'installed-from-registry' || !state.updateAvailable) {
                continue;
            }
            const entry = pluginEntries.find(candidate => candidate.pluginId === info.pluginId);
            if (!entry) {
                continue;
            }
            const mode = this.policy.getMode('plugin', entry.pluginId);
            if (mode === 'off') {
                continue;
            }
            pending.push({
                kind: 'plugin',
                label: entry.name,
                mode,
                promptMessage: nls.localize('theia/ai-registry/autoUpdate/pluginAvailable', 'Agent Plugin "{0}" has an update available.', entry.name),
                successMessage: nls.localize('theia/ai-registry/plugin/updated', 'Updated Agent Plugin "{0}".', entry.name),
                // The same call the Update button makes, so the download is verified against the
                // endorsed hash and the plugin's MCP servers are re-registered afterwards. A hash
                // mismatch still opens its dialog: replacing content the registry cannot vouch for
                // is the user's decision whether or not the update was automatic.
                apply: () => this.pluginInstaller.install(entry, { replaceExisting: true, confirm: false }).then(() => undefined)
            });
        }
        return pending;
    }

    /**
     * Applies a batch, reporting one info message for the successes and one warning if
     * anything failed. Each update is isolated so one failure does not abort the rest.
     */
    protected async applyAll(updates: PendingUpdate[]): Promise<void> {
        const succeeded: PendingUpdate[] = [];
        let failed = 0;
        for (const update of updates) {
            try {
                await update.apply();
                succeeded.push(update);
            } catch (error) {
                failed++;
                this.logger.error(`Failed to auto-update ${update.kind} "${update.label}".`, error);
            }
        }
        if (succeeded.length === 1) {
            this.messageService.info(succeeded[0].successMessage);
        } else if (succeeded.length > 1) {
            this.messageService.info(nls.localize('theia/ai-registry/autoUpdate/updatedMany', 'Updated {0} AI registry items.', succeeded.length));
        }
        if (failed > 0) {
            const show = nls.localizeByDefault('Show');
            // Deliberately not awaited: a notification with an action stays until the user acts
            // on it, and waiting here would hold back a pending "ask" prompt indefinitely.
            this.messageService.warn(
                nls.localize('theia/ai-registry/autoUpdate/updateFailed', 'Could not auto-update {0} AI registry items.', failed),
                show
            ).then(
                answer => answer === show ? this.showInstalled() : undefined,
                error => this.logger.error('Failed to report AI registry auto-update failures.', error)
            );
        }
    }

    /**
     * Offers the pending updates. There is deliberately no "don't update" action: closing the
     * notification already means "not now", and the pass runs again on the next window load.
     * Per-artifact policy is not offered here either; it lives in the gear menu, where it can
     * name its target.
     */
    protected async promptPending(updates: PendingUpdate[]): Promise<boolean> {
        const doUpdate = updates.length === 1
            ? nls.localizeByDefault('Update')
            : nls.localize('theia/ai-registry/autoUpdate/updateAll', 'Update All');
        const show = nls.localizeByDefault('Show');
        const message = updates.length === 1
            ? updates[0].promptMessage
            : nls.localize('theia/ai-registry/autoUpdate/summary', '{0} AI registry updates are available.', updates.length);
        const answer = await this.messageService.info(`${message} ${this.settingsHint()}`, doUpdate, show);
        if (answer === doUpdate) {
            await this.applyAll(updates);
            return true;
        }
        if (answer === show) {
            await this.showInstalled();
        }
        return false;
    }

    /**
     * Asks once, ever, whether updates should be applied automatically from now on. "Once" is
     * anchored on the preference rather than on separate bookkeeping, so setting it by hand in
     * Settings counts as answering. Dismissing writes nothing and the prompt returns on the
     * next window load.
     *
     * @param outstanding updates the user has not already applied. Turning auto update on
     * applies them right away, since a user who just asked for automatic updates would
     * otherwise watch the ones that prompted the question sit untouched until the next reload.
     */
    protected async promptForDefault(outstanding: PendingUpdate[]): Promise<void> {
        if (this.policy.hasExplicitDefault()) {
            return;
        }
        const enable = nls.localize('theia/ai-registry/autoUpdate/enableDefault', 'Enable Auto Update');
        const keepAsking = nls.localize('theia/ai-registry/autoUpdate/keepAsking', 'Keep Asking');
        const never = nls.localizeByDefault('Never');
        const answer = await this.messageService.info(
            `${nls.localize(
                'theia/ai-registry/autoUpdate/defaultPrompt',
                'Update skills, MCP servers and Agent Plugins from the AI registry automatically from now on?'
            )} ${this.settingsChangeHint()}`,
            enable, keepAsking, never
        );
        if (answer === enable) {
            await this.policy.setDefault('on');
            if (outstanding.length > 0) {
                await this.applyAll(outstanding);
            }
        } else if (answer === keepAsking) {
            await this.policy.setDefault('ask');
        } else if (answer === never) {
            await this.policy.setDefault('off');
        }
    }

    /** Opens the Extensions view on the installed artifacts, where updates surface per card. */
    protected async showInstalled(): Promise<void> {
        await this.commandService.executeCommand(VSXExtensionsCommands.SHOW_INSTALLED.id);
    }

    protected settingsHint(): string {
        return nls.localize('theia/ai-registry/autoUpdate/configureDefault', 'Configure the default in {0}.', this.settingsLink());
    }

    protected settingsChangeHint(): string {
        return nls.localize('theia/ai-registry/autoUpdate/changeLater', 'You can change this later in {0}.', this.settingsLink());
    }

    /**
     * Markdown link opening the default preference. Notification messages are rendered as
     * inline markdown and their links are opened through the `OpenerService`, where core's
     * `CommandOpenHandler` picks up the `command:` scheme.
     */
    protected settingsLink(): string {
        const args = encodeURIComponent(JSON.stringify([AUTO_UPDATE_PREF]));
        return `[${nls.localizeByDefault('Settings')}](command:${CommonCommands.OPEN_PREFERENCES.id}?${args})`;
    }
}
