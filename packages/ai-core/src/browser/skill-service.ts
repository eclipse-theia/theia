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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { DisposableCollection, Emitter, Event, ILogger, URI } from '@theia/core';
import { Path } from '@theia/core/lib/common/path';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AICorePreferences, PREFERENCE_NAME_SKILL_DIRECTORIES } from '../common/ai-core-preferences';
import { Skill, SkillDescription, SKILL_FILE_NAME, validateSkillDescription, parseSkillFile, combineSkillDirectories } from '../common/skill';
import { PromptService } from '../common/prompt-service';

export const SkillService = Symbol('SkillService');
export interface SkillService {
    /** Get all discovered skills */
    getSkills(): Skill[];

    /** Get a skill by name */
    getSkill(name: string): Skill | undefined;

    /** Event fired when skills change */
    readonly onSkillsChanged: Event<void>;
}

@injectable()
export class DefaultSkillService implements SkillService {
    @inject(AICorePreferences)
    protected readonly preferences: AICorePreferences;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ILogger)
    @named('SkillService')
    protected readonly logger: ILogger;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    protected skills = new Map<string, Skill>();
    protected toDispose = new DisposableCollection();

    protected readonly onSkillsChangedEmitter = new Emitter<void>();
    readonly onSkillsChanged: Event<void> = this.onSkillsChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(event => {
            if (event.preferenceName === PREFERENCE_NAME_SKILL_DIRECTORIES) {
                this.update();
            }
        });
        this.workspaceService.onWorkspaceChanged(() => {
            this.update();
        });
        // Wait for preferences to be ready before initial update
        this.preferences.ready.then(() => {
            this.update();
        });
    }

    getSkills(): Skill[] {
        return Array.from(this.skills.values());
    }

    getSkill(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    protected async update(): Promise<void> {
        const newDisposables = new DisposableCollection();
        const newSkills = new Map<string, Skill>();

        const workspaceSkillsDir = this.getWorkspaceSkillsDirectoryPath();

        // Get home directory for tilde expansion
        const homeDirUri = await this.envVariablesServer.getHomeDirUri();
        const homePath = new URI(homeDirUri).path.fsPath();

        // Get configured directories from preferences and expand tilde
        const configuredDirectories = (this.preferences[PREFERENCE_NAME_SKILL_DIRECTORIES] ?? [])
            .map(dir => Path.untildify(dir, homePath));
        const defaultSkillsDir = await this.getDefaultSkillsDirectoryPath();

        // Priority: workspace > configured > default (first directory wins on duplicates)
        const allDirectories = combineSkillDirectories(workspaceSkillsDir, configuredDirectories, defaultSkillsDir);

        for (const directoryPath of allDirectories) {
            await this.processSkillDirectory(directoryPath, newSkills, newDisposables);
        }

        // Unregister old skill commands
        for (const name of this.skills.keys()) {
            this.promptService.removePromptFragment(`skill-command-${name}`);
        }

        // Atomically replace state
        this.toDispose.dispose();
        this.toDispose = newDisposables;
        this.skills = newSkills;

        // Register new skill commands
        for (const [name, skill] of newSkills) {
            this.promptService.addBuiltInPromptFragment({
                id: `skill-command-${name}`,
                template: `{{skill:${name}}}`,
                isCommand: true,
                commandName: name,
                commandDescription: skill.description
            });
        }

        this.logger.info(`Loaded ${this.skills.size} skills`);
        this.onSkillsChangedEmitter.fire();
    }

    protected getWorkspaceSkillsDirectoryPath(): string | undefined {
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            return undefined;
        }
        // Use primary workspace root
        return roots[0].resource.resolve('.prompts/skills').path.fsPath();
    }

    protected async getDefaultSkillsDirectoryPath(): Promise<string> {
        const configDirUri = await this.envVariablesServer.getConfigDirUri();
        const configDir = new URI(configDirUri);
        return configDir.resolve('skills').path.fsPath();
    }

    protected async processSkillDirectory(directoryPath: string, skills: Map<string, Skill>, disposables: DisposableCollection): Promise<void> {
        const dirURI = URI.fromFilePath(directoryPath);

        try {
            const dirExists = await this.fileService.exists(dirURI);
            if (!dirExists) {
                return;
            }

            const stat = await this.fileService.resolve(dirURI);
            if (stat.children === undefined) {
                return;
            }

            for (const child of stat.children) {
                if (child.isDirectory) {
                    const directoryName = child.name;
                    await this.loadSkillFromDirectory(child.resource, directoryName, skills);
                }
            }

            this.setupDirectoryWatcher(dirURI, disposables);
        } catch (error) {
            this.logger.error(`Error processing directory '${directoryPath}': ${error}`);
        }
    }

    protected async loadSkillFromDirectory(directoryUri: URI, directoryName: string, skills: Map<string, Skill>): Promise<void> {
        const skillFileUri = directoryUri.resolve(SKILL_FILE_NAME);

        const fileExists = await this.fileService.exists(skillFileUri);
        if (!fileExists) {
            return;
        }

        try {
            const fileContent = await this.fileService.read(skillFileUri);
            const parsed = parseSkillFile(fileContent.value);

            if (!parsed.metadata) {
                this.logger.warn(`Skill in '${directoryName}': SKILL.md file has no valid YAML frontmatter`);
                return;
            }

            if (!SkillDescription.is(parsed.metadata)) {
                this.logger.warn(`Skill in '${directoryName}': Invalid skill description - missing required fields (name, description)`);
                return;
            }

            const validationErrors = validateSkillDescription(parsed.metadata, directoryName);
            if (validationErrors.length > 0) {
                this.logger.warn(`Skill in '${directoryName}': ${validationErrors.join('; ')}`);
                return;
            }

            const skillName = parsed.metadata.name;

            if (skills.has(skillName)) {
                this.logger.warn(`Skill '${skillName}': Duplicate skill found in '${directoryName}', using first discovered instance`);
                return;
            }

            const skill: Skill = {
                ...parsed.metadata,
                location: skillFileUri.path.fsPath()
            };

            skills.set(skillName, skill);
        } catch (error) {
            this.logger.error(`Failed to load skill from '${directoryName}': ${error}`);
        }
    }

    protected setupDirectoryWatcher(dirURI: URI, disposables: DisposableCollection): void {
        disposables.push(this.fileService.watch(dirURI, { recursive: true, excludes: [] }));
        disposables.push(this.fileService.onDidFilesChange(async (event: FileChangesEvent) => {
            const isRelevantChange = event.changes.some(change => {
                const changeUri = change.resource.toString();
                return changeUri.startsWith(dirURI.toString()) &&
                    change.resource.path.base === SKILL_FILE_NAME;
            });

            if (isRelevantChange) {
                await this.update();
            }
        }));
    }
}
