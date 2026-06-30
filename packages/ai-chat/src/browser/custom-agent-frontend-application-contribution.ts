// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { AgentService, CustomAgentDescription, PromptFragmentCustomizationService } from '@theia/ai-core';
import { Command, CommandContribution, CommandRegistry, ILogger, MessageService, nls } from '@theia/core';
import { FrontendApplicationContribution, LocalStorageService } from '@theia/core/lib/browser';
import { inject, injectable, optional, named } from '@theia/core/shared/inversify';
import { ChatAgentService } from '../common';
import { CustomAgentFactory } from './custom-agent-factory';

type CustomAgentMigrationReports = Awaited<ReturnType<PromptFragmentCustomizationService['migrateCustomAgentsYaml']>>;

/** Local-storage key recording that the user dismissed the custom-agent migration prompt for good. */
const MIGRATION_DONT_SHOW_AGAIN_KEY = 'ai-chat.customAgents.migration.dontShowAgain';

export const RERUN_CUSTOM_AGENT_MIGRATION_COMMAND: Command = Command.toLocalizedCommand(
    {
        id: 'ai-chat.customAgents.rerunMigration',
        label: 'Re-run custom-agent migration',
        category: 'AI'
    },
    'theia/ai/chat/customAgents/rerunMigration',
    'theia/ai/chat/category'
);

@injectable()
export class AICustomAgentsFrontendApplicationContribution implements FrontendApplicationContribution, CommandContribution {
    @inject(CustomAgentFactory)
    protected readonly customAgentFactory: CustomAgentFactory;

    @inject(PromptFragmentCustomizationService) @optional()
    protected readonly customizationService: PromptFragmentCustomizationService;

    @inject(AgentService)
    private readonly agentService: AgentService;

    @inject(ChatAgentService)
    private readonly chatAgentService: ChatAgentService;

    @inject(MessageService) @optional()
    protected readonly messageService?: MessageService;

    @inject(LocalStorageService)
    protected readonly storageService: LocalStorageService;

    @inject(ILogger) @named('ai-chat:AICustomAgentsFrontendApplicationContribution')
    protected readonly logger: ILogger;

    private knownCustomAgents: Map<string, CustomAgentDescription> = new Map();

    /** Ensures the migration consent prompt is shown at most once per session. */
    protected migrationPromptShown = false;
    /** Guards against concurrent pending-migration checks from re-entrant refreshes. */
    protected migrationCheckInFlight = false;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(RERUN_CUSTOM_AGENT_MIGRATION_COMMAND, {
            isEnabled: () => !!this.customizationService,
            execute: async () => {
                if (!this.customizationService) { return; }
                const reports = await this.customizationService.migrateCustomAgentsYaml();
                this.showMigrationSummary(reports);
            }
        });
    }

    onStart(): void {
        this.customizationService?.onDidChangeCustomAgents(() => this.refreshCustomAgents());
        this.refreshCustomAgents().catch(e => this.logger.error('Failed to load custom agents', e));
    }

    protected async refreshCustomAgents(): Promise<void> {
        if (!this.customizationService) {
            return;
        }
        // Migration must run on the refresh path (not just at onStart) because the workspace's
        // additional template directories are populated asynchronously by TemplatePreferenceContribution
        // after preferences/workspace/trust are ready.
        await this.maybeMigrate();

        const customAgents = await this.customizationService.getCustomAgents();
        const customAgentsToAdd = customAgents.filter(agent =>
            !this.knownCustomAgents.has(agent.id) || !CustomAgentDescription.equals(this.knownCustomAgents.get(agent.id)!, agent));
        const customAgentIdsToRemove = [...this.knownCustomAgents.values()].filter(agent =>
            !customAgents.find(a => CustomAgentDescription.equals(a, agent))).map(a => a.id);

        // delete first so we don't have to deal with the case where we add and remove the same agentId
        customAgentIdsToRemove.forEach(id => {
            this.chatAgentService.unregisterChatAgent(id);
            this.agentService.unregisterAgent(id);
            this.knownCustomAgents.delete(id);
        });
        customAgentsToAdd.forEach(agent => {
            this.customAgentFactory(agent.id, agent.name, agent.description, agent.prompt, agent.defaultLLM, agent.showInChat, agent.promptVariants);
            this.knownCustomAgents.set(agent.id, agent);
        });
    }

    /**
     * Prompts the user once per session before migrating legacy `customAgents.yml` files (and before
     * correcting agents migrated with merged headings by an earlier Theia version). Nothing is written
     * until the user confirms. Declining is safe: legacy `customAgents.yml` files keep being loaded, so
     * agents continue to work unmigrated, and the prompt reappears next session until they migrate or
     * pick "Don't Show Again".
     *
     * This is intentionally not backed by a preference: the whole migration path is transitional and
     * will be removed once the legacy format is no longer supported. The "don't show again" choice is
     * persisted in local storage (like the dev-container suggestion), so there is no setting to retire.
     */
    protected async maybeMigrate(): Promise<void> {
        if (!this.customizationService || !this.messageService) {
            return;
        }
        if (this.migrationPromptShown || this.migrationCheckInFlight) {
            return;
        }
        this.migrationCheckInFlight = true;
        try {
            if (await this.storageService.getData<boolean>(MIGRATION_DONT_SHOW_AGAIN_KEY)) {
                this.migrationPromptShown = true; // suppress further checks for this session too
                return;
            }
            if (!(await this.customizationService.hasPendingCustomAgentMigration())) {
                return;
            }
            this.migrationPromptShown = true;
            await this.promptAndMigrate();
        } catch (e) {
            this.logger.warn('Custom-agent migration check failed; continuing without migration', e);
        } finally {
            this.migrationCheckInFlight = false;
        }
    }

    protected async promptAndMigrate(): Promise<void> {
        if (!this.customizationService || !this.messageService) {
            return;
        }
        const migrate = nls.localizeByDefault('Migrate');
        const notNow = nls.localizeByDefault('Not Now');
        const dontShowAgain = nls.localizeByDefault("Don't Show Again");
        const message = nls.localize(
            'theia/ai/chat/customAgents/migratePrompt/message',
            'Your custom agents still use the older `customAgents.yml` format. '
            + 'We recommend migrating them to the new per-agent format (`agents/<id>/agent.md`), which Theia uses going forward. '
            + 'Each agent gets its own file next to your `customAgents.yml`, and the original is kept as a `customAgents.yml.bak` backup.'
        );
        const choice = await this.messageService.info(message, migrate, notNow, dontShowAgain);
        if (choice === migrate) {
            try {
                const reports = await this.customizationService.migrateCustomAgentsYaml();
                this.showMigrationSummary(reports);
            } catch (e) {
                this.logger.warn('Custom-agent migration failed', e);
            }
        } else if (choice === dontShowAgain) {
            try {
                await this.storageService.setData(MIGRATION_DONT_SHOW_AGAIN_KEY, true);
            } catch (e) {
                this.logger.warn('Failed to persist custom-agent migration prompt state', e);
            }
        }
        // 'Not Now' or dismissal: do nothing; the prompt reappears next session until migrated or dismissed for good.
    }

    protected showMigrationSummary(reports: CustomAgentMigrationReports): void {
        const migrated = reports.reduce((sum, r) => sum + r.migrated, 0);
        const corrected = reports.reduce((sum, r) => sum + r.corrected, 0);
        const failed = reports.reduce((sum, r) => sum + r.failed, 0);
        const backedUp = reports.filter(r => r.yamlBackedUp).length;
        const overrides = reports.reduce((sum, r) => sum + r.promptOverridesMigrated, 0);
        const message = nls.localize(
            'theia/ai/chat/customAgents/migrationResult',
            'Custom-agent migration: {0} migrated, {1} corrected, {2} failed, {3} legacy customAgents.yml backed up to .bak, {4} prompt overrides folded into agent.md.',
            migrated, corrected, failed, backedUp, overrides
        );
        // Keep the result visible until the user dismisses it (no auto-hide timeout).
        this.messageService?.info(message, { timeout: 0 });
    }

    onStop(): void {
    }
}
