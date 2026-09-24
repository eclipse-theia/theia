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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger, URI } from '@theia/core';
import { PreferenceScope } from '@theia/core/lib/common/preferences';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { AiConfigurationService, AISettings } from '../common';
import { AGENTS_MD_FILE_NAME } from '../common/agents-md';
import { AISettingsServiceImpl } from './ai-settings-service';

/** Workspace-relative location of the prompt fragment that `AGENTS.md` replaces. */
export const LEGACY_PROJECT_INFO_PATH = '.prompts/project-info.prompttemplate';
export const LEGACY_PROJECT_INFO_BACKUP_PATH = `${LEGACY_PROJECT_INFO_PATH}.bak`;

/** Agent id before the retargeting to the `AGENTS.md` standard. */
export const LEGACY_PROJECT_INFO_AGENT_ID = 'ProjectInfo';
export const AGENTS_MD_AGENT_ID = 'AgentsMd';

/** Prompt ids of the retargeted agent, needed to keep `selectedVariants` pointing at the right prompts. */
const PROMPT_ID_RENAMES: ReadonlyArray<readonly [string, string]> = [
    ['project-info-system', 'agents-md-system'],
    ['project-info-template', 'agents-md-template']
];

/** Matches the prompt fragment syntax that stops being resolved once content lives in `AGENTS.md`. */
const PROMPT_SYNTAX_PATTERN = /\{\{[^}]+\}\}|~\{[^}]+\}/;

/** Outcome of attempting to migrate one workspace root. Roots without a legacy file produce no report. */
export interface AgentsMdMigrationReport {
    /** The workspace root this report belongs to. */
    root: URI;
    /** Whether `AGENTS.md` was written from the legacy file. */
    migrated: boolean;
    /** Whether an `AGENTS.md` was already present, so the legacy file was only backed up. */
    alreadyPresent: boolean;
    /** Whether the legacy file was renamed to `.bak`. */
    backedUp: boolean;
    /**
     * Whether the migrated content still contains `{{...}}` or `~{...}` references. `AGENTS.md` is
     * read as a plain file, never resolved as a prompt fragment, so those references are now inert.
     */
    containsPromptSyntax: boolean;
    /** Set when the root could not be migrated. */
    error?: string;
}

/**
 * Migrates the legacy `.prompts/project-info.prompttemplate` prompt fragment to a root
 * `AGENTS.md`, and carries the retargeted agent's settings over to its new id.
 *
 * Idempotent: once the legacy file has been renamed to `.bak` a re-run does nothing, and an
 * `AGENTS.md` that already exists is never overwritten.
 */
@injectable()
export class AgentsMdMigrationService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WorkspaceTrustService)
    protected readonly workspaceTrustService: WorkspaceTrustService;

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    @inject(ILogger) @named('ai-core:AgentsMdMigrationService')
    protected readonly logger: ILogger;

    /**
     * In-flight migration promise used to serialize {@link migrate} calls. Startup and the initial
     * workspace-trust resolution both trigger a migration, and the `Re-run AGENTS.md migration`
     * command can land on top of either; without this guard they race on the same legacy file, and
     * whichever `createFile` loses throws because the write deliberately passes no `overwrite`.
     */
    protected migrationInFlight: Promise<AgentsMdMigrationReport[]> | undefined;

    /**
     * Writes `AGENTS.md` for every workspace root that still has a legacy project-info fragment.
     *
     * Writing into the workspace requires trust; the agent settings rename does not, because it
     * addresses user scope on both the read and the write side. Concurrent callers join the run
     * already under way rather than starting a second one.
     */
    async migrate(): Promise<AgentsMdMigrationReport[]> {
        if (this.migrationInFlight) {
            return this.migrationInFlight;
        }
        this.migrationInFlight = this.doMigrate().finally(() => {
            this.migrationInFlight = undefined;
        });
        return this.migrationInFlight;
    }

    protected async doMigrate(): Promise<AgentsMdMigrationReport[]> {
        await this.migrateAgentSettings();

        if (!(await this.workspaceTrustService.getWorkspaceTrust())) {
            this.logger.info('Skipping AGENTS.md migration: the workspace is not trusted');
            return [];
        }

        const reports: AgentsMdMigrationReport[] = [];
        for (const root of this.workspaceService.tryGetRoots()) {
            const report = await this.migrateRoot(root.resource);
            if (report) {
                reports.push(report);
            }
        }
        return reports;
    }

    protected async migrateRoot(root: URI): Promise<AgentsMdMigrationReport | undefined> {
        const legacyURI = root.resolve(LEGACY_PROJECT_INFO_PATH);
        if (!(await this.fileService.exists(legacyURI))) {
            return undefined;
        }

        const report: AgentsMdMigrationReport = {
            root, migrated: false, alreadyPresent: false, backedUp: false, containsPromptSyntax: false
        };
        const targetURI = root.resolve(AGENTS_MD_FILE_NAME);

        try {
            if (await this.fileService.exists(targetURI)) {
                // Never overwrite: an existing AGENTS.md is authoritative, and it is what every other
                // tool reading the standard already sees.
                report.alreadyPresent = true;
            } else {
                const content = (await this.fileService.read(legacyURI)).value;
                report.containsPromptSyntax = PROMPT_SYNTAX_PATTERN.test(content);
                await this.fileService.createFile(targetURI, BinaryBuffer.fromString(content));
                report.migrated = true;
            }
        } catch (e) {
            report.error = `${e?.message ?? e}`;
            this.logger.warn(`Failed to migrate ${legacyURI.toString()} to ${targetURI.toString()}: ${report.error}`);
            return report;
        }

        // Back up in both cases. While the legacy file exists it overrides the built-in `project-info`
        // fragment, so leaving it in place would keep AGENTS.md from ever being used.
        try {
            await this.fileService.move(legacyURI, root.resolve(LEGACY_PROJECT_INFO_BACKUP_PATH), { overwrite: true });
            report.backedUp = true;
        } catch (e) {
            this.logger.warn(`Migrated ${legacyURI.toString()} but failed to back it up: ${e?.message ?? e}`);
        }

        if (report.containsPromptSyntax) {
            this.logger.warn(
                `${targetURI.toString()} contains prompt fragment syntax ('{{...}}' or '~{...}') carried over from ` +
                `${LEGACY_PROJECT_INFO_PATH}. AGENTS.md is read as a plain file, so these references are no longer resolved.`
            );
        }
        return report;
    }

    /**
     * Carries the retargeted agent's settings from its former id to `AgentsMd`, including the prompt
     * ids in `selectedVariants`. Does nothing once the new id is present.
     *
     * Reads and writes **user scope only**, explicitly. The effective value is merged across scopes
     * and, while the workspace is untrusted, has its workspace and folder contributions suppressed,
     * whereas a `update()` write lands in the narrowest scope the key is already defined in. Passing
     * that merged value to `update()` would therefore rewrite a workspace-scoped
     * `ai-features.agentSettings` with an object assembled from a different set of scopes, dropping
     * every entry the read had suppressed. Addressing one scope on both sides is what makes this
     * safe to run outside the trust gate.
     *
     * A `ProjectInfo` entry stored in workspace or folder scope is consequently left alone rather
     * than renamed; it goes stale, which costs the user that agent's model assignment, and is the
     * deliberate trade against touching a file the workspace owns.
     */
    protected async migrateAgentSettings(): Promise<void> {
        try {
            await this.aiConfigurationService.ready;
            // `inspect` is constrained to `JSONValue`, which `AISettings` does not structurally
            // satisfy; the stored shape is the same one `get<AISettings>` returns elsewhere.
            const inspection = this.aiConfigurationService.inspect<JSONValue>(AISettingsServiceImpl.PREFERENCE_NAME);
            const settings = (inspection?.globalValue as AISettings | undefined) ?? {};
            const legacy = settings[LEGACY_PROJECT_INFO_AGENT_ID];
            if (!legacy || settings[AGENTS_MD_AGENT_ID]) {
                return;
            }

            const selectedVariants = legacy.selectedVariants && Object.fromEntries(
                Object.entries(legacy.selectedVariants).map(([promptId, variantId]) => {
                    const rename = PROMPT_ID_RENAMES.find(([from]) => from === promptId);
                    return [rename ? rename[1] : promptId, variantId];
                })
            );

            const migrated: AISettings = { ...settings, [AGENTS_MD_AGENT_ID]: { ...legacy, ...(selectedVariants ? { selectedVariants } : {}) } };
            delete migrated[LEGACY_PROJECT_INFO_AGENT_ID];
            await this.aiConfigurationService.set(AISettingsServiceImpl.PREFERENCE_NAME, migrated, PreferenceScope.User);
            this.logger.info(`Migrated agent settings from '${LEGACY_PROJECT_INFO_AGENT_ID}' to '${AGENTS_MD_AGENT_ID}'`);
        } catch (e) {
            this.logger.warn(`Failed to migrate agent settings to '${AGENTS_MD_AGENT_ID}': ${e?.message ?? e}`);
        }
    }
}
