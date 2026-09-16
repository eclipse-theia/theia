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

import { Emitter, Event, ILogger, URI } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { Path } from '@theia/core/lib/common/path';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { SkillRegistryUiBridge } from '@theia/ai-core/lib/browser/skill-registry-ui-bridge';
import { Skill, SKILL_FILE_NAME } from '@theia/ai-core/lib/common/skill';
import { VSXExtensionsContribution } from '@theia/vsx-registry/lib/browser/vsx-extensions-contribution';
import { VSXExtensionsSearchModel } from '@theia/vsx-registry/lib/browser/vsx-extensions-search-model';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { SkillInstallClientImpl } from './skill-install-client';
import { SkillInstallService } from './skill-install-service';

/**
 * Lets the AI configuration view label and reveal the skills this package manages, without
 * `@theia/ai-core` depending on it. Cached because {@link getRegistryEntryId} is called from React
 * renders and must answer synchronously.
 */
@injectable()
export class SkillRegistryUiBridgeImpl implements SkillRegistryUiBridge {

    @inject(SkillInstallService)
    protected readonly installService: SkillInstallService;

    @inject(SkillInstallClientImpl)
    protected readonly installClient: SkillInstallClientImpl;

    @inject(RegistryFetchService)
    protected readonly fetchService: RegistryFetchService;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(VSXExtensionsContribution)
    protected readonly viewContribution: VSXExtensionsContribution;

    @inject(VSXExtensionsSearchModel)
    protected readonly searchModel: VSXExtensionsSearchModel;

    @inject(ILogger) @named('ai-registry:SkillRegistryUiBridgeImpl')
    protected readonly logger: ILogger;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    /**
     * Registry entry ids of the managed skills, keyed by the `SKILL.md` path each one must sit at -
     * `<skills root>/<name>/SKILL.md`, the only shape this package installs.
     *
     * Keyed by location rather than by name because a workspace skill takes precedence over a managed
     * one of the same name, and labelling that as coming from the registry would credit the registry
     * for a file the user wrote.
     */
    protected entryIdsByLocation = new Map<string, string>();

    /** Ids the registry currently lists, so {@link revealSkill} can tell a live entry from a revoked one. */
    protected listedSkillIds = new Set<string>();

    @postConstruct()
    protected init(): void {
        this.installClient.onDidChangeInstalledSkills(() => this.refreshCache());
        // A refreshed feed can revoke an entry, which changes where revealing it should land.
        this.fetchService.onDidChange(() => this.refreshCache());
        // Primed eagerly, or the first render shows no provenance until something changes.
        this.refreshCache();
    }

    getRegistryEntryId(skill: Skill): string | undefined {
        return this.entryIdsByLocation.get(Path.normalizePathSeparator(skill.location));
    }

    revealSkill(skillId: string): void {
        // Search only for ids the registry still lists, as the MCP bridge does: a query switches the view
        // to its search results, so for a revoked id an empty search would hide the very entry the user
        // asked about - the Installed section shows it, with a warning, when no query is set.
        if (this.listedSkillIds.has(skillId)) {
            this.searchModel.query = skillId;
        }
        this.viewContribution.openView({ activate: true }).catch(error =>
            this.logger.warn(`Could not open the Extensions view to reveal the skill "${skillId}".`, error));
    }

    protected async refreshCache(): Promise<void> {
        try {
            const root = await this.resolveSkillsRoot();
            const installed = await this.installService.listInstalledSkills();
            this.entryIdsByLocation = new Map(installed
                .filter(info => info.skillId !== undefined)
                .map(info => [`${root}/${info.name}/${SKILL_FILE_NAME}`, info.skillId!]));
            this.listedSkillIds = new Set((await this.fetchService.getSkillEntries()).map(entry => entry.skillId));
            this.onDidChangeEmitter.fire();
        } catch (error) {
            // Left as-is: a stale label beats dropping every affordance over one failed call.
            this.logger.warn('Could not list installed registry skills; skill provenance may be out of date.', error);
        }
    }

    /**
     * The frontend view of the backend's install root, resolved the way `SkillService` resolves the
     * same directory, with separators normalized so the keys compare on Windows too.
     */
    protected async resolveSkillsRoot(): Promise<string> {
        const homeDir = new URI(await this.envVariablesServer.getHomeDirUri());
        return Path.normalizePathSeparator(homeDir.resolve('.agents/skills').path.fsPath());
    }
}
