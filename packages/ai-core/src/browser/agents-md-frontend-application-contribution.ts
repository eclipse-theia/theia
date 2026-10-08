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
import { Command, CommandContribution, CommandRegistry, DisposableCollection, ILogger, MessageService, nls } from '@theia/core';
import { FrontendApplicationContribution, OpenerService, open } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceStorageService } from '@theia/workspace/lib/browser/workspace-storage-service';
import { hash } from '@theia/core/lib/common/hash';
import { PromptFragmentCustomizationService } from '../common/prompt-service';
import { AGENTS_MD_FILE_NAME, PROJECT_INFO_PROMPT_FRAGMENT_ID } from '../common/agents-md';
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

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceStorageService)
    protected readonly storageService: WorkspaceStorageService;

    @inject(PromptFragmentCustomizationService)
    protected readonly customizationService: PromptFragmentCustomizationService;

    @inject(FrontendApplicationStateService)
    protected readonly appStateService: FrontendApplicationStateService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(MessageService) @optional()
    protected readonly messageService?: MessageService;

    @inject(ILogger) @named('ai-core:AgentsMdFrontendApplicationContribution')
    protected readonly logger: ILogger;

    /** In-flight run started by {@link onStart} or by the initial trust resolution. */
    protected startupMigration: Promise<void> | undefined;

    /**
     * How long the prompt customizations have to be stable before overrides are reported. The
     * workspace template locations are configured only after the initial scan of the global ones, and
     * each rescan fires several events; reporting on the first of them would show a notification for a
     * state that is about to change.
     */
    protected overrideWarningDelay = 1000;
    protected overrideWarningTimer: ReturnType<typeof setTimeout> | undefined;
    /** Set once the application and the workspace trust are ready, the earliest a report makes sense. */
    protected overrideWarningEnabled = false;
    protected overrideWarningUpdates: Promise<void> = Promise.resolve();
    protected shownOverrideFingerprint: number | undefined;
    protected readonly toDispose = new DisposableCollection();

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(RERUN_AGENTS_MD_MIGRATION_COMMAND, {
            execute: () => this.runMigration(true)
        });
    }

    onStart(): void {
        // Full configuration reloads publish their completed source maps via this event.
        this.toDispose.push(this.customizationService.onDidChangeCustomAgents(() => this.scheduleOverrideWarning()));
        this.toDispose.push(this.customizationService.onDidChangePromptFragmentCustomization(ids => {
            if (ids.includes(PROJECT_INFO_PROMPT_FRAGMENT_ID)) {
                this.scheduleOverrideWarning();
            }
        }));
        this.runStartupMigration();
        this.toDispose.push(this.workspaceTrustService.onDidChangeWorkspaceTrust(trusted => {
            if (trusted) {
                this.runStartupMigration();
            }
        }));
        Promise.all([
            this.appStateService.reachedState('ready'),
            this.workspaceService.ready,
            this.workspaceTrustService.getWorkspaceTrust()
        ]).then(() => {
            this.overrideWarningEnabled = true;
            this.scheduleOverrideWarning();
        });
    }

    onStop(): void {
        clearTimeout(this.overrideWarningTimer);
        this.toDispose.dispose();
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
            if (reports.length === 0 && reportEmptyResult && !(await this.workspaceTrustService.getWorkspaceTrust())) {
                // The migration skips untrusted workspaces, so "nothing to migrate" would be misleading.
                this.messageService?.info(nls.localize('theia/ai/core/agentsMd/migrationResult/untrusted',
                    'AGENTS.md migration: the workspace is not trusted, so no project info was migrated.'));
            } else {
                this.showMigrationSummary(reports, reportEmptyResult);
            }
            this.scheduleOverrideWarning();
        } catch (e) {
            this.logger.warn('AGENTS.md migration failed', e);
        }
    }

    protected scheduleOverrideWarning(): void {
        if (!this.overrideWarningEnabled) {
            // A check is scheduled as soon as it is.
            return;
        }
        clearTimeout(this.overrideWarningTimer);
        this.overrideWarningTimer = setTimeout(() => {
            this.overrideWarningTimer = undefined;
            this.overrideWarningUpdates = this.overrideWarningUpdates.then(async () => {
                // Migration can rename a local source while the initial template scan is still running.
                await this.startupMigration;
                await this.showOverrideWarning();
            }).catch(error => this.logger.warn('Failed to report legacy project-info overrides', error));
        }, this.overrideWarningDelay);
    }

    protected async showOverrideWarning(): Promise<void> {
        if (!this.messageService || !(await this.workspaceTrustService.getWorkspaceTrust())) {
            return;
        }
        await this.workspaceService.ready;
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return;
        }
        const localSources = new Set(roots.map(root => root.resource.resolve(LEGACY_PROJECT_INFO_PATH).toString()));
        const sources = (this.customizationService.getPromptFragmentCustomizationSources?.(PROJECT_INFO_PROMPT_FRAGMENT_ID) ?? [])
            .filter(source => !localSources.has(source.uri.toString()))
            .sort((left, right) => left.uri.toString().localeCompare(right.uri.toString()));
        if (sources.length === 0) {
            this.shownOverrideFingerprint = undefined;
            return;
        }
        // The active status is deliberately not part of it: it depends on which template locations
        // are loaded, so it can differ between startups without anything the user would act on.
        const fingerprint = hash([
            this.workspaceService.workspace?.resource.toString(),
            roots.map(root => root.resource.toString()).sort(),
            sources.map(source => [source.uri.toString(), source.template])
        ]);
        const storageKey = 'ai-core.agentsMd.dismissedProjectInfoOverrides';
        if (this.shownOverrideFingerprint === fingerprint || await this.storageService.getData<number>(storageKey) === fingerprint) {
            return;
        }
        this.shownOverrideFingerprint = fingerprint;
        // Notifications render Markdown and collapse newlines, so each path is a code span in a flat list.
        const paths = sources.map(source => nls.localizeByDefault(
            '{0} ({1})', `\`${source.uri.path.toString()}\``,
            source.active ? nls.localizeByDefault('Active') : nls.localize('theia/ai/core/agentsMd/inactiveOverride', 'Inactive')
        )).join(', ');
        const message = nls.localize(
            'theia/ai/core/agentsMd/legacyOverrides',
            'These project-info prompt overrides are not migrated automatically and no longer reach the built-in agents that use AGENTS.md. '
            + 'Move the instructions you want to keep into the relevant project\'s AGENTS.md. '
            + 'They still apply to prompts that reference project-info: {0}', paths
        );
        const openAction = nls.localize('theia/ai/core/agentsMd/openOverrideSources', 'Open Source Files');
        this.messageService.warn(message, { timeout: 0 }, openAction).then(async choice => {
            if (choice === openAction) {
                for (const source of sources) {
                    await open(this.openerService, source.uri);
                }
            } else {
                await this.storageService.setData(storageKey, fingerprint);
            }
        }).catch(error => this.logger.warn('Failed to handle legacy project-info override notification', error));
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

        const openAction = migrated.length > 0 ? nls.localizeByDefault('Open') : undefined;
        // Keep the result visible until dismissed: it announces a new file in the user's repository.
        this.messageService.info(message, { timeout: 0 }, ...(openAction ? [openAction] : [])).then(choice => {
            // Dismissing resolves to `undefined`, which must not be mistaken for the action when there is none.
            if (openAction && choice === openAction) {
                open(this.openerService, migrated[0].root.resolve(AGENTS_MD_FILE_NAME));
            }
        });
        if (withPromptSyntax > 0) {
            // A separate warning: appended to the summary it was easy to miss.
            this.messageService.warn(nls.localize(
                'theia/ai/core/agentsMd/migrationResult/promptSyntax',
                '{0} of the migrated files still contain prompt template syntax, which {1} no longer resolves. Review and remove it.',
                withPromptSyntax, AGENTS_MD_FILE_NAME
            ), { timeout: 0 });
        }
    }
}
