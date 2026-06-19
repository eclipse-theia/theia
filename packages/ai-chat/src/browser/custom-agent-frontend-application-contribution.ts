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
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable, optional, named } from '@theia/core/shared/inversify';
import { ChatAgentService } from '../common';
import { CustomAgentFactory } from './custom-agent-factory';

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

    @inject(ILogger) @named('ai-chat:AICustomAgentsFrontendApplicationContribution')
    protected readonly logger: ILogger;

    private knownCustomAgents: Map<string, CustomAgentDescription> = new Map();

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(RERUN_CUSTOM_AGENT_MIGRATION_COMMAND, {
            isEnabled: () => !!this.customizationService,
            execute: async () => {
                if (!this.customizationService) { return; }
                const reports = await this.customizationService.migrateCustomAgentsYaml();
                const migrated = reports.reduce((sum, r) => sum + r.migrated, 0);
                const failed = reports.reduce((sum, r) => sum + r.failed, 0);
                const backedUp = reports.filter(r => r.yamlBackedUp).length;
                const overrides = reports.reduce((sum, r) => sum + r.promptOverridesMigrated, 0);
                const message = nls.localize(
                    'theia/ai/chat/customAgents/migrationResult',
                    'Custom-agent migration: {0} migrated, {1} failed, {2} legacy customAgents.yml backed up to .bak, {3} prompt overrides folded into agent.md.',
                    migrated, failed, backedUp, overrides
                );
                this.messageService?.info(message);
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
        // after preferences/workspace/trust are ready. Migration is idempotent: if a customAgents.yml has
        // already been migrated (or never existed), the call is a no-op.
        try {
            await this.customizationService.migrateCustomAgentsYaml();
        } catch (e) {
            this.logger.warn('Custom-agent auto-migration failed; continuing without migration', e);
        }

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

    onStop(): void {
    }
}
