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
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ContributionProvider, Disposable, DisposableCollection, Emitter, Event, ILogger, MaybePromise, URI } from '@theia/core';
import { Path } from '@theia/core/lib/common/path';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent, FileChangeType } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AICorePreferences, PREFERENCE_NAME_SKILL_DIRECTORIES } from '../common/ai-core-preferences';
import {
    Skill,
    SkillDescription,
    SkillDirectoryEntry,
    SKILL_FILE_NAME,
    validateSkillDescription,
    parseSkillFile,
    combineSkillDirectories
} from '../common/skill';

/** Debounce delay for coalescing rapid file system events */
const UPDATE_DEBOUNCE_MS = 50;

export const SkillDirectoryContribution = Symbol('SkillDirectoryContribution');
/**
 * Contributes further roots to scan for skills. Point this at the *parent* of the skill folders,
 * never at a skill folder itself. Contributed roots form the lowest-precedence `plugin` tier, so a
 * directory the user controls always wins a path collision.
 */
export interface SkillDirectoryContribution {
    /** Entries carrying a {@link SkillDirectoryEntry.qualifier} have their skills prefixed with it. */
    getSkillDirectories(): MaybePromise<SkillDirectoryEntry[]>;
    readonly onDidChange?: Event<void>;
}

export const SkillService = Symbol('SkillService');
export interface SkillService {
    /** Get all discovered skills */
    getSkills(): Skill[];

    /**
     * Matched against {@link Skill.qualifiedName} first, then the plain
     * {@link SkillDescription.name} so unqualified references keep resolving. A plain name shared by
     * several skills is ambiguous and resolves to `undefined`.
     */
    getSkill(name: string): Skill | undefined;

    /** Event fired when skills change */
    readonly onSkillsChanged: Event<void>;

    /** Promise that resolves when initial skill loading is complete */
    readonly ready: Promise<void>;
}

@injectable()
export class DefaultSkillService implements SkillService, Disposable {
    @inject(AICorePreferences)
    protected readonly preferences: AICorePreferences;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ILogger) @named('ai-core:DefaultSkillService')
    protected readonly logger: ILogger;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ContributionProvider)
    @named(SkillDirectoryContribution)
    protected readonly skillDirectoryContributions: ContributionProvider<SkillDirectoryContribution>;

    /** Keyed by {@link Skill.qualifiedName}. */
    protected skills = new Map<string, Skill>();
    /** Watchers of the current scan; disposed and rebuilt on every rescan. */
    protected toDispose = new DisposableCollection();
    /** Kept apart from {@link toDispose}, which does not survive a rescan. */
    protected readonly toDisposeOnServiceDispose = new DisposableCollection();
    protected watchedDirectories = new Set<string>();
    protected parentWatchers = new Map<string, string>();

    protected readonly onSkillsChangedEmitter = new Emitter<void>();
    readonly onSkillsChanged: Event<void> = this.onSkillsChangedEmitter.event;
    protected lastSkillDirectoriesValue: string | undefined;

    protected updateDebounceTimeout: ReturnType<typeof setTimeout> | undefined;

    /** True while {@link update} is running, so concurrent callers do not duplicate the scan and its log output. */
    protected updateInProgress = false;
    /** Set when {@link update} is called while another run is in progress; triggers a follow-up scan when the current one finishes. */
    protected updateRescheduled = false;

    protected _ready = new Deferred<void>();
    get ready(): Promise<void> {
        return this._ready.promise;
    }

    @postConstruct()
    protected init(): void {
        for (const contribution of this.skillDirectoryContributions.getContributions()) {
            if (contribution.onDidChange) {
                this.toDisposeOnServiceDispose.push(contribution.onDidChange(() => this.scheduleUpdate()));
            }
        }

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

        this.initializeSkills();
    }

    /** Runs the initial scan once the skill directory sources are known. {@link ready} always resolves, even if the scan failed. */
    protected async initializeSkills(): Promise<void> {
        try {
            // The workspace contributes the workspace skill directories, the preferences the configured ones.
            await Promise.all([this.workspaceService.ready, this.preferences.ready]);
        } catch (error) {
            this.logger.error('Failed to resolve skill directory sources, scanning the already known directories', error);
        }

        // Listen for changes before the initial scan, otherwise a change landing while it runs is recorded as
        // already applied by the snapshot below and dropped. update()'s in-progress guard coalesces the overlap.
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

        try {
            await this.update();
        } catch (error) {
            this.logger.error('Initial skill scan failed', error);
        }
        this._ready.resolve();
    }

    getSkills(): Skill[] {
        return Array.from(this.skills.values());
    }

    getSkill(name: string): Skill | undefined {
        const qualifiedMatch = this.skills.get(name);
        if (qualifiedMatch) {
            return qualifiedMatch;
        }
        // Ambiguous plain names resolve to nothing: guessing would silently load a skill the caller
        // did not ask for.
        const plainMatches = this.getSkills().filter(skill => skill.name === name);
        return plainMatches.length === 1 ? plainMatches[0] : undefined;
    }

    dispose(): void {
        this.toDisposeOnServiceDispose.dispose();
        this.toDispose.dispose();
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
        // Serialise concurrent update() calls: a workspace-ready trigger and a file-change-driven
        // scheduleUpdate() can fire within the same async tick, in which case both runs would
        // scan and log everything, producing the duplicated log lines that motivated this guard.
        // The second caller records a pending request and lets the first finish; the follow-up
        // is then re-scheduled through the debouncer so any further events coalesce into it.
        if (this.updateInProgress) {
            this.updateRescheduled = true;
            return;
        }
        this.updateInProgress = true;
        try {
            await this.doUpdate();
        } finally {
            this.updateInProgress = false;
            if (this.updateRescheduled) {
                this.updateRescheduled = false;
                this.scheduleUpdate();
            }
        }
    }

    protected async doUpdate(): Promise<void> {
        this.toDispose.dispose();
        const newDisposables = new DisposableCollection();
        const newSkills = new Map<string, Skill>();

        const workspaceSkillsDirs = this.getWorkspaceSkillsDirectoryPaths();

        const homeDirUri = await this.envVariablesServer.getHomeDirUri();
        const homePath = new URI(homeDirUri).path.fsPath();

        const configuredDirectories = (this.preferences[PREFERENCE_NAME_SKILL_DIRECTORIES] ?? [])
            .map(dir => Path.untildify(dir, homePath));
        const defaultSkillsDirs = await this.getDefaultSkillsDirectoryPaths();
        const pluginSkillsDirs = await this.getContributedSkillDirectories();

        const newWatchedDirectories = new Set<string>();
        const newParentWatchers = new Map<string, string>();

        const allDirectories = combineSkillDirectories(workspaceSkillsDirs, configuredDirectories, defaultSkillsDirs, pluginSkillsDirs);
        for (const { path: directoryPath, tier, qualifier } of allDirectories) {
            if (tier === 'configured') {
                await this.processConfiguredSkillDirectory(directoryPath, newSkills, newDisposables, newWatchedDirectories, qualifier);
            } else {
                // `plugin` roots take this path too: a plugin with no `skills` directory is a
                // plugin without skills, worth watching for rather than warning about.
                await this.processSkillDirectoryWithParentWatching(
                    directoryPath,
                    newSkills,
                    newDisposables,
                    newWatchedDirectories,
                    newParentWatchers,
                    qualifier
                );
            }
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

    /** A failing contribution is skipped: one broken root must not cost every other skill. */
    protected async getContributedSkillDirectories(): Promise<SkillDirectoryEntry[]> {
        const entries: SkillDirectoryEntry[] = [];
        for (const contribution of this.skillDirectoryContributions.getContributions()) {
            try {
                entries.push(...await contribution.getSkillDirectories());
            } catch (error) {
                this.logger.error(`Failed to collect contributed skill directories: ${error}`);
            }
        }
        return entries;
    }

    protected getWorkspaceSkillsDirectoryPaths(): string[] {
        return this.workspaceService.tryGetRoots().flatMap(root => [
            root.resource.resolve('.prompts/skills').path.fsPath(),
            root.resource.resolve('.agents/skills').path.fsPath()
        ]);
    }

    protected async getDefaultSkillsDirectoryPaths(): Promise<string[]> {
        const configDirUri = await this.envVariablesServer.getConfigDirUri();
        const configDir = new URI(configDirUri);
        const homeDirUri = await this.envVariablesServer.getHomeDirUri();
        const homeDir = new URI(homeDirUri);
        return [
            configDir.resolve('skills').path.fsPath(),
            homeDir.resolve('.agents/skills').path.fsPath()
        ];
    }

    protected async processSkillDirectoryWithParentWatching(
        directoryPath: string,
        skills: Map<string, Skill>,
        disposables: DisposableCollection,
        watchedDirectories: Set<string>,
        parentWatchers: Map<string, string>,
        qualifier?: string
    ): Promise<void> {
        const dirURI = URI.fromFilePath(directoryPath);

        try {
            const dirExists = await this.fileService.exists(dirURI);

            if (dirExists) {
                await this.processExistingSkillDirectory(dirURI, skills, disposables, watchedDirectories, qualifier);
            } else {
                const parentPath = dirURI.parent.path.fsPath();
                const parentURI = URI.fromFilePath(parentPath);
                const parentExists = await this.fileService.exists(parentURI);

                if (parentExists) {
                    const parentUriString = parentURI.toString();
                    disposables.push(this.fileService.watch(parentURI, { recursive: false, excludes: [] }));
                    parentWatchers.set(parentUriString, directoryPath);
                    this.logger.debug(`Watching parent directory '${parentPath}' for skills folder creation`);
                } else {
                    this.logger.debug(`Cannot watch skills directory '${directoryPath}': parent directory does not exist`);
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
        watchedDirectories: Set<string>,
        qualifier?: string
    ): Promise<void> {
        const dirURI = URI.fromFilePath(directoryPath);

        try {
            const dirExists = await this.fileService.exists(dirURI);

            if (!dirExists) {
                this.logger.warn(`Configured skill directory '${directoryPath}' does not exist`);
                return;
            }

            await this.processExistingSkillDirectory(dirURI, skills, disposables, watchedDirectories, qualifier);
        } catch (error) {
            this.logger.error(`Error processing configured directory '${directoryPath}': ${error}`);
        }
    }

    protected async processExistingSkillDirectory(
        dirURI: URI,
        skills: Map<string, Skill>,
        disposables: DisposableCollection,
        watchedDirectories: Set<string>,
        qualifier?: string
    ): Promise<void> {
        const stat = await this.fileService.resolve(dirURI);
        if (!stat.children) {
            return;
        }

        for (const child of stat.children) {
            if (child.isDirectory) {
                const directoryName = child.name;
                await this.loadSkillFromDirectory(child.resource, directoryName, skills, qualifier);
            }
        }

        this.setupDirectoryWatcher(dirURI, disposables, watchedDirectories);
    }

    protected async loadSkillFromDirectory(directoryUri: URI, directoryName: string, skills: Map<string, Skill>, qualifier?: string): Promise<void> {
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

            const qualifiedName = Skill.qualifyName(parsed.metadata.name, qualifier);

            if (skills.has(qualifiedName)) {
                this.logger.warn(`Skill '${qualifiedName}': Duplicate skill found in '${directoryName}', using first discovered instance`);
                return;
            }

            const skill: Skill = {
                ...parsed.metadata,
                location: skillFileUri.path.fsPath(),
                qualifiedName
            };

            skills.set(qualifiedName, skill);
        } catch (error) {
            this.logger.error(`Failed to load skill from '${directoryName}': ${error}`);
        }
    }

    protected setupDirectoryWatcher(dirURI: URI, disposables: DisposableCollection, watchedDirectories: Set<string>): void {
        disposables.push(this.fileService.watch(dirURI, { recursive: true, excludes: [] }));
        watchedDirectories.add(dirURI.toString());
    }
}
