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
import { FileChangesEvent, FileChangeType } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AICorePreferences, PREFERENCE_NAME_SKILL_DIRECTORIES } from '../common/ai-core-preferences';
import { Skill, SkillDescription, SKILL_FILE_NAME, validateSkillDescription, parseSkillFile } from '../common/skill';

/** Debounce delay for coalescing rapid file system events */
const UPDATE_DEBOUNCE_MS = 50;

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

    protected skills = new Map<string, Skill>();
    protected toDispose = new DisposableCollection();
    protected watchedDirectories = new Set<string>();
    protected parentWatchers = new Map<string, string>();

    protected readonly onSkillsChangedEmitter = new Emitter<void>();
    readonly onSkillsChanged: Event<void> = this.onSkillsChangedEmitter.event;
    protected lastSkillDirectoriesValue: string | undefined;

    protected updateDebounceTimeout: ReturnType<typeof setTimeout> | undefined;

    @postConstruct()
    protected init(): void {
        this.fileService.onDidFilesChange(async (event: FileChangesEvent) => {
            for (const change of event.changes) {
                if (change.type === FileChangeType.ADDED) {
                    const changeUri = change.resource.toString();
                    for (const [, skillsPath] of this.parentWatchers) {
                        const expectedSkillsUri = URI.fromFilePath(skillsPath).toString();
                        if (changeUri === expectedSkillsUri) {
                            this.scheduleUpdate();
                            return;
                        }
                    }
                }
                // Check for skills directory deletion - switch back to parent watching
                if (change.type === FileChangeType.DELETED) {
                    const changeUri = change.resource.toString();
                    if (this.watchedDirectories.has(changeUri)) {
                        this.scheduleUpdate();
                        return;
                    }
                }
            }

            const isRelevantChange = event.changes.some(change => {
                const changeUri = change.resource.toString();
                const isInWatchedDir = Array.from(this.watchedDirectories).some(dirUri =>
                    changeUri.startsWith(dirUri)
                );
                if (!isInWatchedDir) {
                    return false;
                }
                // Trigger on SKILL.md changes or directory additions/deletions
                const isSkillFile = change.resource.path.base === SKILL_FILE_NAME;
                const isDirectoryChange = change.type === FileChangeType.ADDED || change.type === FileChangeType.DELETED;
                return isSkillFile || isDirectoryChange;
            });
            if (isRelevantChange) {
                this.scheduleUpdate();
            }
        });

        // Wait for workspace to be ready before initial update
        this.workspaceService.ready.then(() => {
            this.update().then(() => {
                // Only after initial update, start listening for changes
                this.lastSkillDirectoriesValue = JSON.stringify(this.preferences[PREFERENCE_NAME_SKILL_DIRECTORIES]);

                this.preferences.onPreferenceChanged(event => {
                    if (event.preferenceName === PREFERENCE_NAME_SKILL_DIRECTORIES) {
                        const currentValue = JSON.stringify(this.preferences[PREFERENCE_NAME_SKILL_DIRECTORIES]);
                        if (currentValue === this.lastSkillDirectoriesValue) {
                            return;
                        }
                        this.lastSkillDirectoriesValue = currentValue;
                        this.scheduleUpdate();
                    }
                });

                this.workspaceService.onWorkspaceChanged(() => {
                    this.scheduleUpdate();
                });
            });
        });
    }

    getSkills(): Skill[] {
        return Array.from(this.skills.values());
    }

    getSkill(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    protected scheduleUpdate(): void {
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
        }
        this.updateDebounceTimeout = setTimeout(() => {
            this.updateDebounceTimeout = undefined;
            this.update();
        }, UPDATE_DEBOUNCE_MS);
    }

    protected async update(): Promise<void> {
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
            this.updateDebounceTimeout = undefined;
        }
        this.toDispose.dispose();
        const newDisposables = new DisposableCollection();
        const newSkills = new Map<string, Skill>();

        const workspaceSkillsDir = this.getWorkspaceSkillsDirectoryPath();

        const homeDirUri = await this.envVariablesServer.getHomeDirUri();
        const homePath = new URI(homeDirUri).path.fsPath();

        const configuredDirectories = (this.preferences[PREFERENCE_NAME_SKILL_DIRECTORIES] ?? [])
            .map(dir => Path.untildify(dir, homePath));
        const defaultSkillsDir = await this.getDefaultSkillsDirectoryPath();

        const newWatchedDirectories = new Set<string>();
        const newParentWatchers = new Map<string, string>();

        if (workspaceSkillsDir) {
            await this.processSkillDirectoryWithParentWatching(
                workspaceSkillsDir,
                newSkills,
                newDisposables,
                newWatchedDirectories,
                newParentWatchers
            );
        }

        for (const configuredDir of configuredDirectories) {
            const configuredDirUri = URI.fromFilePath(configuredDir).toString();
            if (!newWatchedDirectories.has(configuredDirUri)) {
                await this.processConfiguredSkillDirectory(configuredDir, newSkills, newDisposables, newWatchedDirectories);
            }
        }

        const defaultSkillsDirUri = URI.fromFilePath(defaultSkillsDir).toString();
        if (!newWatchedDirectories.has(defaultSkillsDirUri)) {
            await this.processSkillDirectoryWithParentWatching(
                defaultSkillsDir,
                newSkills,
                newDisposables,
                newWatchedDirectories,
                newParentWatchers
            );
        }

        if (newSkills.size > 0 && newSkills.size !== this.skills.size) {
            this.logger.info(`Loaded ${newSkills.size} skills`);
        }

        this.toDispose = newDisposables;
        this.skills = newSkills;
        this.watchedDirectories = newWatchedDirectories;
        this.parentWatchers = newParentWatchers;

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

    protected async processSkillDirectoryWithParentWatching(
        directoryPath: string,
        skills: Map<string, Skill>,
        disposables: DisposableCollection,
        watchedDirectories: Set<string>,
        parentWatchers: Map<string, string>
    ): Promise<void> {
        const dirURI = URI.fromFilePath(directoryPath);

        try {
            const dirExists = await this.fileService.exists(dirURI);

            if (dirExists) {
                await this.processExistingSkillDirectory(dirURI, skills, disposables, watchedDirectories);
            } else {
                const parentPath = dirURI.parent.path.fsPath();
                const parentURI = URI.fromFilePath(parentPath);
                const parentExists = await this.fileService.exists(parentURI);

                if (parentExists) {
                    const parentUriString = parentURI.toString();
                    disposables.push(this.fileService.watch(parentURI, { recursive: false, excludes: [] }));
                    parentWatchers.set(parentUriString, directoryPath);
                    this.logger.info(`Watching parent directory '${parentPath}' for skills folder creation`);
                } else {
                    this.logger.warn(`Cannot watch skills directory '${directoryPath}': parent directory does not exist`);
                }
            }
        } catch (error) {
            this.logger.error(`Error processing directory '${directoryPath}': ${error}`);
        }
    }

    protected async processConfiguredSkillDirectory(
        directoryPath: string,
        skills: Map<string, Skill>,
        disposables: DisposableCollection,
        watchedDirectories: Set<string>
    ): Promise<void> {
        const dirURI = URI.fromFilePath(directoryPath);

        try {
            const dirExists = await this.fileService.exists(dirURI);

            if (!dirExists) {
                this.logger.warn(`Configured skill directory '${directoryPath}' does not exist`);
                return;
            }

            await this.processExistingSkillDirectory(dirURI, skills, disposables, watchedDirectories);
        } catch (error) {
            this.logger.error(`Error processing configured directory '${directoryPath}': ${error}`);
        }
    }

    protected async processExistingSkillDirectory(
        dirURI: URI,
        skills: Map<string, Skill>,
        disposables: DisposableCollection,
        watchedDirectories: Set<string>
    ): Promise<void> {
        const stat = await this.fileService.resolve(dirURI);
        if (!stat.children) {
            return;
        }

        for (const child of stat.children) {
            if (child.isDirectory) {
                const directoryName = child.name;
                await this.loadSkillFromDirectory(child.resource, directoryName, skills);
            }
        }

        this.setupDirectoryWatcher(dirURI, disposables, watchedDirectories);
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

    protected setupDirectoryWatcher(dirURI: URI, disposables: DisposableCollection, watchedDirectories: Set<string>): void {
        disposables.push(this.fileService.watch(dirURI, { recursive: true, excludes: [] }));
        watchedDirectories.add(dirURI.toString());
    }
}
