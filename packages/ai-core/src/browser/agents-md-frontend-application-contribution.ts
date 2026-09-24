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

import { inject, injectable, named, optional } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, ILogger, MessageService, nls } from '@theia/core';
import { FrontendApplicationContribution, OpenerService, open } from '@theia/core/lib/browser';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { AGENTS_MD_FILE_NAME } from '../common/agents-md';
import { AgentsMdMigrationReport, AgentsMdMigrationService, LEGACY_PROJECT_INFO_BACKUP_PATH, LEGACY_PROJECT_INFO_PATH } from './agents-md-migration-service';

export const RERUN_AGENTS_MD_MIGRATION_COMMAND: Command = Command.toLocalizedCommand(
    {
        id: 'ai-core.agentsMd.rerunMigration',
        label: 'Re-run AGENTS.md migration',
        category: 'AI'
    },
    'theia/ai/core/agentsMd/rerunMigration',
    'theia/ai/core/category'
);

/**
 * Runs the `AGENTS.md` migration on startup and exposes it as a command.
 *
 * The migration writes into the workspace root, a file the user will see in source control, so
 * unlike the silent `customAgents.yml` migration it always reports what it did. Migration is
 * re-attempted when the workspace becomes trusted; roots added later are covered by the command.
 */
@injectable()
export class AgentsMdFrontendApplicationContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(AgentsMdMigrationService)
    protected readonly migrationService: AgentsMdMigrationService;

    @inject(WorkspaceTrustService)
    protected readonly workspaceTrustService: WorkspaceTrustService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(MessageService) @optional()
    protected readonly messageService?: MessageService;

    @inject(ILogger) @named('ai-core:AgentsMdFrontendApplicationContribution')
    protected readonly logger: ILogger;

    /** In-flight run started by {@link onStart} or by the initial trust resolution. */
    protected startupMigration: Promise<void> | undefined;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(RERUN_AGENTS_MD_MIGRATION_COMMAND, {
            execute: () => this.runMigration(true)
        });
    }

    onStart(): void {
        this.runStartupMigration();
        this.workspaceTrustService.onDidChangeWorkspaceTrust(trusted => {
            if (trusted) {
                this.runStartupMigration();
            }
        });
    }

    /**
     * `onDidChangeWorkspaceTrust` fires for the *initial* trust resolution as well as for later
     * transitions, and that resolution lands after `onStart` has already started a run and parked it
     * on the same deferred. Both triggers therefore fire on an ordinary trusted startup. The service
     * keeps them from migrating twice; this keeps the second one from reporting the result again.
     *
     * Deliberately an in-flight promise rather than a latch: a workspace that starts untrusted has
     * nothing to migrate, and the run that matters is the one after the user grants trust.
     */
    protected runStartupMigration(): Promise<void> {
        if (!this.startupMigration) {
            this.startupMigration = this.runMigration(false).finally(() => {
                this.startupMigration = undefined;
            });
        }
        return this.startupMigration;
    }

    /**
     * @param reportEmptyResult whether to tell the user when there was nothing to migrate. Only the
     * command does: on startup the common case is that nothing is pending, and saying so every time
     * would be noise.
     */
    protected async runMigration(reportEmptyResult: boolean): Promise<void> {
        try {
            const reports = await this.migrationService.migrate();
            this.showMigrationSummary(reports, reportEmptyResult);
        } catch (e) {
            this.logger.warn('AGENTS.md migration failed', e);
        }
    }

    protected showMigrationSummary(reports: AgentsMdMigrationReport[], reportEmptyResult: boolean): void {
        if (!this.messageService) {
            return;
        }
        if (reports.length === 0) {
            if (reportEmptyResult) {
                this.messageService.info(nls.localize('theia/ai/core/agentsMd/migrationResult/empty', 'AGENTS.md migration: nothing to migrate.'));
            }
            return;
        }

        const migrated = reports.filter(report => report.migrated);
        const alreadyPresent = reports.filter(report => report.alreadyPresent).length;
        const failed = reports.filter(report => report.error).length;
        const withPromptSyntax = reports.filter(report => report.containsPromptSyntax).length;
        const notBackedUp = reports.filter(report => !report.error && !report.backedUp).length;

        let message = nls.localize(
            'theia/ai/core/agentsMd/migrationResult',
            'AGENTS.md migration: {0} written, {1} skipped because an AGENTS.md already existed, {2} failed.',
            migrated.length, alreadyPresent, failed
        );
        if (notBackedUp === 0) {
            message += ' ' + nls.localize(
                'theia/ai/core/agentsMd/migrationResult/backedUp',
                'The previous project info was kept as `{0}`.',
                LEGACY_PROJECT_INFO_BACKUP_PATH
            );
        } else {
            // Not cosmetic: while the legacy file is in place it overrides the built-in `project-info`
            // fragment, so an AGENTS.md written next to it is never the one used.
            message += ' ' + nls.localize(
                'theia/ai/core/agentsMd/migrationResult/backupFailed',
                '{0} could not be renamed to `{1}`, so it is still in place and takes precedence over {2}. '
                + 'Rename or remove it to start using {2}.',
                LEGACY_PROJECT_INFO_PATH, LEGACY_PROJECT_INFO_BACKUP_PATH, AGENTS_MD_FILE_NAME
            );
        }
        if (withPromptSyntax > 0) {
            message += ' ' + nls.localize(
                'theia/ai/core/agentsMd/migrationResult/promptSyntax',
                '{0} of the migrated files still contain prompt template syntax, which {1} no longer resolves — review and remove it.',
                withPromptSyntax, AGENTS_MD_FILE_NAME
            );
        }

        const openAction = migrated.length > 0 ? nls.localizeByDefault('Open') : undefined;
        // Keep the result visible until dismissed: it announces a new file in the user's repository.
        this.messageService.info(message, { timeout: 0 }, ...(openAction ? [openAction] : [])).then(choice => {
            // Dismissing resolves to `undefined`, which must not be mistaken for the action when there is none.
            if (openAction && choice === openAction) {
                open(this.openerService, migrated[0].root.resolve(AGENTS_MD_FILE_NAME));
            }
        });
    }
}
