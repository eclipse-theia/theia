/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import {
    Command,
    CommandContribution,
    CommandRegistry, Disposable,
    DisposableCollection,
    Emitter,
    Event, MenuContribution,
    MenuModelRegistry
} from '@theia/core';
import {
    DiffUris,
    LabelProvider,
    StatusBar,
    StatusBarEntry,
    Widget
} from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import {
    EDITOR_CONTEXT_MENU,
    EditorContextMenu,
    EditorManager,
    EditorOpenerOptions,
    EditorWidget
} from '@theia/editor/lib/browser';
import { Git, GitFileChange, GitFileStatus, Repository, WorkingDirectoryStatus, CommitWithChanges } from '../common';

import { GitCommands } from './git-commands';
import { GitRepositoryTracker } from './git-repository-tracker';
import { GitAction, GitQuickOpenService } from './git-quick-open-service';
import { GitSyncService } from './git-sync-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { GitPrompt } from '../common/git-prompt';
import {
    ScmCommand,
    ScmProvider,
    ScmRepository,
    ScmResource,
    ScmResourceGroup,
    ScmService,
    ScmCommit,
    ScmAmendSupport
} from '@theia/scm/lib/browser';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitCommitMessageValidator } from '../browser/git-commit-message-validator';
import { GitErrorHandler } from '../browser/git-error-handler';
import {
    ScmTitleCommandsContribution,
    ScmTitleCommandRegistry
} from '@theia/scm/lib/browser/scm-title-command-registry';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import {
    ScmResourceCommandContribution,
    ScmResourceCommandRegistry
} from '@theia/scm/lib/browser/scm-resource-command-registry';
import {
    ScmGroupCommandContribution,
    ScmGroupCommandRegistry
} from '@theia/scm/lib/browser/scm-group-command-registry';
import { GitDecorator } from './git-decorator';

export const GIT_WIDGET_FACTORY_ID = 'git';

export const EDITOR_CONTEXT_MENU_GIT = [...EDITOR_CONTEXT_MENU, '3_git'];

export namespace GIT_COMMANDS {
    export const CLONE = {
        id: 'git.clone',
        label: 'Git: Clone...'
    };
    export const FETCH = {
        id: 'git.fetch',
        label: 'Git: Fetch...'
    };
    export const PULL_DEFAULT = {
        id: 'git.pull.default',
        label: 'Git: Pull'
    };
    export const PULL = {
        id: 'git.pull',
        label: 'Git: Pull from...'
    };
    export const PUSH_DEFAULT = {
        id: 'git.push.default',
        label: 'Git: Push'
    };
    export const PUSH = {
        id: 'git.push',
        label: 'Git: Push to...'
    };
    export const MERGE = {
        id: 'git.merge',
        label: 'Git: Merge...'
    };
    export const CHECKOUT = {
        id: 'git.checkout',
        label: 'Git: Checkout'
    };
    export const COMMIT = {
        id: 'git.commit.all',
        tooltip: 'Commit all the staged changes',
        text: 'Commit',
    };
    export const COMMIT_ADD_SIGN_OFF = {
        id: 'git-commit-add-sign-off',
        label: 'Add Signed-off-by',
        iconClass: 'fa fa-pencil-square-o',
        category: 'navigation',
        props: { ['group']: 'navigation' }
    };
    export const COMMIT_AMEND = {
        id: 'git.commit.amend'
    };
    export const COMMIT_SIGN_OFF = {
        id: 'git.commit.signOff'
    };
    export const CHANGE_REPOSITORY = {
        id: 'git.change.repository',
        label: 'Git: Change Repository...'
    };
    export const OPEN_FILE: Command = {
        id: 'git.open.file',
        category: 'Git',
        label: 'Open File'
    };
    export const OPEN_CHANGED_FILE: Command = {
        id: 'git.open.changed.file',
        category: 'Git',
        label: 'Open File',
        iconClass: 'open-file'
    };
    export const OPEN_CHANGES: Command = {
        id: 'git.open.changes',
        category: 'Git',
        label: 'Open Changes'
    };
    export const SYNC = {
        id: 'git.sync',
        label: 'Git: Sync'
    };
    export const PUBLISH = {
        id: 'git.publish',
        label: 'Git: Publish Branch'
    };
    export const STAGE = {
        id: 'git.stage',
        label: 'Stage Changes',
        iconClass: 'fa fa-plus'
    };
    export const STAGE_ALL = {
        id: 'git.stage.all',
        label: 'Stage All Changes',
        iconClass: 'fa fa-plus',
        category: 'inline',
        props: { ['group']: 'inline' }
    };
    export const UNSTAGE = {
        id: 'git.unstage',
        iconClass: 'fa fa-minus',
        label: 'Unstage Changes'
    };
    export const UNSTAGE_ALL = {
        id: 'git.unstage.all',
        iconClass: 'fa fa-minus',
        label: 'Unstage All',
        category: 'inline',
        props: { ['group']: 'inline' }
    };
    export const DISCARD = {
        id: 'git.discard',
        iconClass: 'fa fa-undo',
        label: 'Discard Changes'
    };
    export const DISCARD_ALL = {
        id: 'git.discard.all',
        iconClass: 'fa fa-undo',
        label: 'Discard All Changes',
        category: 'inline',
        props: { ['group']: 'inline' }
    };
    export const STASH = {
        id: 'git.stash',
        category: 'Git',
        label: 'Stash...'
    };
    export const APPLY_STASH = {
        id: 'git.stash.apply',
        category: 'Git',
        label: 'Apply Stash...'
    };
    export const APPLY_LATEST_STASH = {
        id: 'git.stash.apply.latest',
        category: 'Git',
        label: 'Apply Latest Stash'
    };
    export const POP_STASH = {
        id: 'git.stash.pop',
        category: 'Git',
        label: 'Pop Stash...'
    };
    export const POP_LATEST_STASH = {
        id: 'git.stash.pop.latest',
        category: 'Git',
        label: 'Pop Latest Stash'
    };
    export const DROP_STASH = {
        id: 'git.stash.drop',
        category: 'Git',
        label: 'Drop Stash...'
    };
    export const REFRESH = {
        id: 'git-refresh',
        label: 'Refresh',
        iconClass: 'fa fa-refresh',
        category: 'navigation',
        props: { ['group']: 'navigation' }
    };
}

@injectable()
export class GitContribution implements
    CommandContribution,
    MenuContribution,
    TabBarToolbarContribution,
    ScmTitleCommandsContribution,
    ScmResourceCommandContribution,
    ScmGroupCommandContribution {

    static GIT_SELECTED_REPOSITORY = 'git-selected-repository';
    static GIT_REPOSITORY_STATUS = 'git-repository-status';
    static GIT_SYNC_STATUS = 'git-sync-status';

    protected toDispose = new DisposableCollection();

    private dirtyRepositories: Repository[] = [];
    private scmProviders: ScmProvider[] = [];

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(GitQuickOpenService) protected readonly quickOpenService: GitQuickOpenService;
    @inject(GitRepositoryTracker) protected readonly repositoryTracker: GitRepositoryTracker;
    @inject(GitSyncService) protected readonly syncService: GitSyncService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(GitPrompt) protected readonly prompt: GitPrompt;
    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider;
    @inject(GitCommitMessageValidator) protected readonly commitMessageValidator: GitCommitMessageValidator;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(Git) protected readonly git: Git;
    @inject(GitErrorHandler) protected readonly gitErrorHandler: GitErrorHandler;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(ScmWidget) protected readonly scmWidget: ScmWidget;
    @inject(GitCommands) protected readonly gitCommands: GitCommands;

    onStart(): void {
        this.repositoryProvider.allRepositories.forEach(repository => this.registerScmProvider(repository));
        this.dirtyRepositories = this.repositoryProvider.allRepositories;
        this.scmService.onDidChangeSelectedRepositories(scmRepository => {
            const repository = this.repositoryProvider.allRepositories.find(repo => {
                if (scmRepository) {
                    return repo.localUri === scmRepository.provider.rootUri;
                } else {
                    return false;
                }
            });
            if (repository) {
                this.repositoryProvider.selectedRepository = repository;
            } else {
                this.statusBar.removeElement(GitContribution.GIT_REPOSITORY_STATUS);
                this.statusBar.removeElement(GitContribution.GIT_SYNC_STATUS);
            }
        });
        this.repositoryTracker.onGitEvent(event => {
            this.checkNewOrRemovedRepositories();
            const { status } = event;
            const branch = status.branch ? status.branch : status.currentHead ? status.currentHead.substring(0, 8) : 'NO-HEAD';
            let dirty = '';
            if (status.changes.length > 0) {
                const conflicts = this.hasConflicts(status.changes);
                const staged = this.allStaged(status.changes);
                if (conflicts || staged) {
                    if (conflicts) {
                        dirty = '!';
                    } else if (staged) {
                        dirty = '+';
                    }
                } else {
                    dirty = '*';
                }
            }
            const scmProvider = this.scmProviders.find(provider => provider.rootUri === event.source.localUri);
            if (scmProvider) {
                const provider = (scmProvider as ScmProviderImpl);
                this.getGroups(status, provider).then(groups => {
                    provider.groups = groups;
                    provider.fireChangeStatusBarCommands([{
                        id: GIT_COMMANDS.CHECKOUT.id,
                        text: `$(code-fork) ${branch}${dirty}`,
                        command: GIT_COMMANDS.CHECKOUT.id
                    }]);
                    provider.fireChangeResources();
                });
            }
            this.updateSyncStatusBarEntry(event.source.localUri);
        });
        this.syncService.onDidChange(() => this.updateSyncStatusBarEntry(
            this.repositoryProvider.selectedRepository
                ? this.repositoryProvider.selectedRepository.localUri
                : undefined)
        );
    }

    private async getGroups(status: WorkingDirectoryStatus | undefined, provider: ScmProvider): Promise<ScmResourceGroup[]> {
        const groups: ScmResourceGroup[] = [];
        const stagedChanges = [];
        const unstagedChanges = [];
        const mergeChanges = [];
        if (status) {
            for (const change of status.changes) {
                if (GitFileStatus[GitFileStatus.Conflicted.valueOf()] !== GitFileStatus[change.status]) {
                    if (change.staged) {
                        stagedChanges.push(change);
                    } else {
                        unstagedChanges.push(change);
                    }
                } else {
                    if (!change.staged) {
                        mergeChanges.push(change);
                    }
                }
            }
        }
        if (stagedChanges.length > 0) {
            groups.push(await this.getGroup('Staged changes', provider, stagedChanges));
        }
        if (unstagedChanges.length > 0) {
            groups.push(await this.getGroup('Changes', provider, unstagedChanges));
        }
        if (mergeChanges.length > 0) {
            groups.push(await this.getGroup('Merged Changes', provider, mergeChanges));
        }
        return groups;
    }

    private async getGroup(label: string, provider: ScmProvider, changes: GitFileChange[]): Promise<ScmResourceGroup> {
        const sort = (l: ScmResource, r: ScmResource) =>
            l.sourceUri.toString().substring(l.sourceUri.toString().lastIndexOf('/')).localeCompare(r.sourceUri.toString().substring(r.sourceUri.toString().lastIndexOf('/')));
        const group: ScmResourceGroup = {
            handle: 0,
            sourceControlHandle: 0,
            label,
            id: label,
            provider,
            onDidChange: provider.onDidChange,
            resources: [],
            dispose: () => { }
        };
        const scmResources: ScmResource[] = await Promise.all(changes.map(async change => {
            const icon = await this.labelProvider.getIcon(new URI(change.uri));
            const resource: ScmResource = {
                group,
                sourceUri: new URI(change.uri),
                decorations: {
                    icon,
                    letter: GitFileStatus.toAbbreviation(change.status, change.staged),
                    color: GitDecorator.getDecorationColor(change.status),
                    tooltip: GitFileStatus.toString(change.status)
                },
                sourceControlHandle: 0,
                groupHandle: 0,
                handle: 0,
                async open(): Promise<void> {
                    open();
                }
            };
            const open = async () => {
                const uriToOpen = await this.gitCommands.getUriToOpen(change);
                this.editorManager.open(uriToOpen, { mode: 'reveal' });
            };
            return resource;
        }));
        scmResources.sort(sort);
        scmResources.forEach(resource => group.resources.push(resource));
        return group;
    }

    /** Detect and handle added or removed repositories. */
    private checkNewOrRemovedRepositories(): void {
        const added =
            this.repositoryProvider
                .allRepositories
                .find(repo => this.dirtyRepositories.every(dirtyRepo => dirtyRepo.localUri !== repo.localUri));
        if (added) {
            this.registerScmProvider(added);
            this.dirtyRepositories.push(added);
        }
        const removed =
            this.dirtyRepositories
                .find(dirtyRepo => this.repositoryProvider.allRepositories.every(repo => repo.localUri !== dirtyRepo.localUri));
        if (removed) {
            this.dirtyRepositories.push(removed);
            const removedScmRepo = this.scmService.repositories.find(scmRepo => scmRepo.provider.rootUri === removed.localUri);
            if (removedScmRepo) {
                removedScmRepo.dispose();
                const index = this.scmProviders.indexOf(removedScmRepo.provider);
                if (index > -1) {
                    this.scmProviders.splice(index, 1);
                }
            }
        }
    }

    private registerScmProvider(repository: Repository): ScmRepository {
        const uri = repository.localUri;
        const disposableCollection: Disposable[] = [];
        const onDidChangeResourcesEmitter = new Emitter<void>();
        const onDidChangeRepositoryEmitter = new Emitter<void>();
        disposableCollection.push(onDidChangeRepositoryEmitter);
        disposableCollection.push(onDidChangeResourcesEmitter);
        const amendSupport: ScmAmendSupport = new GitAmendSupport(repository, this.git);
        const provider = new ScmProviderImpl('Git', uri.substring(uri.lastIndexOf('/') + 1), uri, amendSupport);
        this.scmProviders.push(provider);
        const repo = this.scmService.registerScmProvider(provider, disposableCollection);
        repo.input.placeholder = 'Commit Message';
        repo.input.validateInput = async input => {
            const validate = await this.commitMessageValidator.validate(input);
            if (validate) {
                const { message, status } = validate;
                return { message, type: status };
            }
        };
        return repo;
    }

    registerMenus(menus: MenuModelRegistry): void {
        [GIT_COMMANDS.FETCH, GIT_COMMANDS.PULL_DEFAULT, GIT_COMMANDS.PULL, GIT_COMMANDS.PUSH_DEFAULT, GIT_COMMANDS.PUSH, GIT_COMMANDS.MERGE].forEach(command =>
            menus.registerMenuAction(ScmWidget.ContextMenu.FIRST_GROUP, {
                commandId: command.id,
                label: command.label.slice('Git: '.length)
            })
        );
        menus.registerMenuAction(ScmWidget.ContextMenu.INPUT_GROUP, {
            commandId: GIT_COMMANDS.COMMIT_AMEND.id,
            label: 'Commit (Amend)'
        });
        menus.registerMenuAction(ScmWidget.ContextMenu.INPUT_GROUP, {
            commandId: GIT_COMMANDS.COMMIT_SIGN_OFF.id,
            label: 'Commit (Signed Off)'
        });
        menus.registerMenuAction(ScmWidget.ContextMenu.BATCH, {
            commandId: GIT_COMMANDS.STAGE_ALL.id,
            label: 'Stage All Changes'
        });
        menus.registerMenuAction(ScmWidget.ContextMenu.BATCH, {
            commandId: GIT_COMMANDS.UNSTAGE_ALL.id,
            label: 'Unstage All Changes'
        });
        menus.registerMenuAction(ScmWidget.ContextMenu.BATCH, {
            commandId: GIT_COMMANDS.DISCARD_ALL.id,
            label: 'Discard All Changes'
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: GIT_COMMANDS.OPEN_FILE.id
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: GIT_COMMANDS.OPEN_CHANGES.id
        });
        [GIT_COMMANDS.STASH, GIT_COMMANDS.APPLY_STASH,
        GIT_COMMANDS.APPLY_LATEST_STASH, GIT_COMMANDS.POP_STASH,
        GIT_COMMANDS.POP_LATEST_STASH, GIT_COMMANDS.DROP_STASH].forEach(command =>
            menus.registerMenuAction(ScmWidget.ContextMenu.SECOND_GROUP, {
                commandId: command.id,
                label: command.label
            })
        );
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(GIT_COMMANDS.FETCH, {
            execute: () => this.quickOpenService.fetch(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PULL_DEFAULT, {
            execute: () => this.quickOpenService.performDefaultGitAction(GitAction.PULL),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PULL, {
            execute: () => this.quickOpenService.pull(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PUSH_DEFAULT, {
            execute: () => this.quickOpenService.performDefaultGitAction(GitAction.PUSH),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PUSH, {
            execute: () => this.quickOpenService.push(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.MERGE, {
            execute: () => this.quickOpenService.merge(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.CHECKOUT, {
            execute: () => this.quickOpenService.checkout(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.COMMIT_SIGN_OFF, {
            execute: () => this.gitCommands.doCommit(this.repositoryTracker.selectedRepository, 'sign-off'),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.COMMIT_AMEND, {
            execute: async () => {
                const { selectedRepository } = this.repositoryTracker;
                if (!!selectedRepository) {
                    try {
                        const message = await this.quickOpenService.commitMessageForAmend();
                        this.gitCommands.doCommit(selectedRepository, 'amend', message);
                    } catch (e) {
                        if (!(e instanceof Error) || e.message !== 'User abort.') {
                            throw e;
                        }
                    }
                }
            },
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.STAGE_ALL, {
            execute: async () => {
                this.gitCommands.stageAll();
            },
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.UNSTAGE_ALL, {
            execute: async () => {
                this.gitCommands.unstageAll();
            },
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.DISCARD_ALL, {
            execute: async () => {
                this.gitCommands.discardAll();
            },
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.CHANGE_REPOSITORY, {
            execute: () => this.quickOpenService.changeRepository(),
            isEnabled: () => this.hasMultipleRepositories()
        });
        registry.registerCommand(GIT_COMMANDS.OPEN_FILE, {
            execute: widget => this.openFile(widget),
            isEnabled: widget => !!this.getOpenFileOptions(widget),
            isVisible: widget => !!this.getOpenFileOptions(widget)
        });
        registry.registerCommand(GIT_COMMANDS.OPEN_CHANGES, {
            execute: widget => this.openChanges(widget),
            isEnabled: widget => !!this.getOpenChangesOptions(widget),
            isVisible: widget => !!this.getOpenChangesOptions(widget)
        });
        registry.registerCommand(GIT_COMMANDS.SYNC, {
            execute: () => this.syncService.sync(),
            isEnabled: () => this.syncService.canSync(),
            isVisible: () => this.syncService.canSync()
        });
        registry.registerCommand(GIT_COMMANDS.PUBLISH, {
            execute: () => this.syncService.publish(),
            isEnabled: () => this.syncService.canPublish(),
            isVisible: () => this.syncService.canPublish()
        });
        registry.registerCommand(GIT_COMMANDS.CLONE, {
            isEnabled: () => this.workspaceService.opened,
            // tslint:disable-next-line:no-any
            execute: (...args: any[]) => {
                let url: string | undefined = undefined;
                let folder: string | undefined = undefined;
                let branch: string | undefined = undefined;
                if (args) {
                    [url, folder, branch] = args;
                }
                return this.quickOpenService.clone(url, folder, branch);
            }
        });
        const commit = () => {
            const scmRepository = this.scmService.selectedRepository;
            if (scmRepository) {
                const localUri = scmRepository.provider.rootUri;
                const message = scmRepository.input.value;
                if (localUri) {
                    this.gitCommands.doCommit({ localUri }, undefined, message);
                }
            }
        };
        registry.registerCommand(GIT_COMMANDS.COMMIT,
            {
                // tslint:disable-next-line:no-any
                execute(): any {
                    commit();
                }
            });
        const refresh = () => {
            this.repositoryProvider.refresh();
        };
        registry.registerCommand(GIT_COMMANDS.REFRESH, {
            // tslint:disable-next-line:no-any
            execute(...args): any {
                refresh();
            }
        });
        const doSignOff = async () => {
            const { selectedRepository } = this.repositoryProvider;
            if (selectedRepository) {
                const [username, email] = await this.gitCommands.getUserConfig(selectedRepository);
                const signOff = `\n\nSigned-off-by: ${username} <${email}>`;
                const commitTextArea = document.getElementById(ScmWidget.Styles.INPUT_MESSAGE) as HTMLTextAreaElement;
                if (commitTextArea) {
                    const content = commitTextArea.value;
                    if (content.endsWith(signOff)) {
                        commitTextArea.value = content.substr(0, content.length - signOff.length);
                    } else {
                        commitTextArea.value = `${content}${signOff}`;
                    }
                    this.scmWidget.resize(commitTextArea);
                    commitTextArea.focus();
                }
            }
        };
        registry.registerCommand(GIT_COMMANDS.COMMIT_ADD_SIGN_OFF, {
            // tslint:disable-next-line:no-any
            execute(...args): any {
                doSignOff();
            }
        });
        const unstage = async (uri: string) => {
            const repository = this.repositoryProvider.selectedRepository;
            if (repository) {
                const status = await this.git.status(repository);
                const gitChange = status.changes.find(change => change.uri === uri);
                if (gitChange) {
                    this.gitCommands.unstage(repository, gitChange);
                }
            }
        };
        registry.registerCommand(GIT_COMMANDS.UNSTAGE, {
            // tslint:disable-next-line:no-any
            execute(...args): any {
                unstage(args[0].uri);
            }
        });
        const stage = async (uri: string) => {
            const repository = this.repositoryProvider.selectedRepository;
            if (repository) {
                const status = await this.git.status(repository);
                const gitChange = status.changes.find(change => change.uri === uri);
                if (gitChange) {
                    this.gitCommands.stage(repository, gitChange);
                }
            }
        };
        registry.registerCommand(GIT_COMMANDS.STAGE, {
            // tslint:disable-next-line:no-any
            execute(...args): any {
                stage(args[0].uri);
            }
        });
        const discard = async (uri: string) => {
            const repository = this.repositoryProvider.selectedRepository;
            if (repository) {
                const status = await this.git.status(repository);
                const gitChange = status.changes.find(change => change.uri === uri);
                if (gitChange) {
                    this.gitCommands.discard(repository, gitChange);
                }
            }
        };
        registry.registerCommand(GIT_COMMANDS.DISCARD, {
            // tslint:disable-next-line:no-any
            execute(...args): any {
                discard(args[0].uri);
            }
        });
        const open = async (uri: string) => {
            this.gitCommands.openFile(new URI(uri));
        };
        registry.registerCommand(GIT_COMMANDS.OPEN_CHANGED_FILE, {
            // tslint:disable-next-line:no-any
            execute(...args): any {
                open(args[0].uri);
            }
        });
        registry.registerCommand(GIT_COMMANDS.STASH, {
            execute: () => this.quickOpenService.stash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository &&
                !!this.repositoryTracker.selectedRepositoryStatus &&
                this.repositoryTracker.selectedRepositoryStatus.changes.length > 0
        });
        registry.registerCommand(GIT_COMMANDS.APPLY_STASH, {
            execute: () => this.quickOpenService.applyStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.APPLY_LATEST_STASH, {
            execute: () => this.quickOpenService.applyLatestStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.POP_STASH, {
            execute: () => this.quickOpenService.popStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.POP_LATEST_STASH, {
            execute: () => this.quickOpenService.popLatestStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.DROP_STASH, {
            execute: () => this.quickOpenService.dropStash(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: GIT_COMMANDS.OPEN_FILE.id,
            command: GIT_COMMANDS.OPEN_FILE.id,
            text: '$(file-o)',
            tooltip: GIT_COMMANDS.OPEN_FILE.label
        });
        registry.registerItem({
            id: GIT_COMMANDS.OPEN_CHANGES.id,
            command: GIT_COMMANDS.OPEN_CHANGES.id,
            text: '$(files-o)',
            tooltip: GIT_COMMANDS.OPEN_CHANGES.label
        });
    }

    protected hasConflicts(changes: GitFileChange[]): boolean {
        return changes.some(c => c.status === GitFileStatus.Conflicted);
    }

    protected allStaged(changes: GitFileChange[]): boolean {
        return !changes.some(c => !c.staged);
    }

    protected async openFile(widget?: Widget): Promise<EditorWidget | undefined> {
        const options = this.getOpenFileOptions(widget);
        return options && this.editorManager.open(options.uri, options.options);
    }

    protected getOpenFileOptions(widget?: Widget): GitOpenFileOptions | undefined {
        const ref = widget ? widget : this.editorManager.currentEditor;
        if (ref instanceof EditorWidget && DiffUris.isDiffUri(ref.editor.uri)) {
            const [, right] = DiffUris.decode(ref.editor.uri);
            const uri = right.withScheme('file');
            const selection = ref.editor.selection;
            return { uri, options: { selection, widgetOptions: { ref } } };
        }
        return undefined;
    }

    async openChanges(widget?: Widget): Promise<EditorWidget | undefined> {
        const options = await this.getOpenChangesOptions(widget);
        if (options) {
            return this.gitCommands.openChange(options.change, options.options);
        }
        return undefined;
    }

    protected getOpenChangesOptions(widget?: Widget): GitOpenChangesOptions | undefined {
        const ref = widget ? widget : this.editorManager.currentEditor;
        if (ref instanceof EditorWidget && !DiffUris.isDiffUri(ref.editor.uri)) {
            const uri = ref.editor.uri;
            const change = this.gitCommands.findChange(uri);
            if (change && this.gitCommands.getUriToOpen(change).toString() !== uri.toString()) {
                const selection = ref.editor.selection;
                return { change, options: { selection, widgetOptions: { ref } } };
            }
        }
        return undefined;
    }

    protected hasMultipleRepositories(): boolean {
        return this.repositoryTracker.allRepositories.length > 1;
    }

    protected updateSyncStatusBarEntry(repositoryUri: string | undefined): void {
        const entry = this.getStatusBarEntry();
        if (entry && repositoryUri) {
            const scmProvider = this.scmProviders.find(provider => provider.rootUri === repositoryUri);
            if (scmProvider) {
                (scmProvider as ScmProviderImpl).fireChangeStatusBarCommands([{
                    id: 'vcs-sync-status',
                    text: entry.text,
                    tooltip: entry.tooltip,
                    command: entry.command,
                }]);
            }
        } else {
            this.statusBar.removeElement(GitContribution.GIT_SYNC_STATUS);
        }
    }
    protected getStatusBarEntry(): (Pick<StatusBarEntry, 'text'> & Partial<StatusBarEntry>) | undefined {
        const status = this.repositoryTracker.selectedRepositoryStatus;
        if (!status || !status.branch) {
            return undefined;
        }
        if (this.syncService.isSyncing()) {
            return {
                text: '$(refresh~spin)',
                tooltip: 'Synchronizing Changes...'
            };
        }
        const { upstreamBranch, aheadBehind } = status;
        if (upstreamBranch) {
            return {
                text: '$(refresh)' + (aheadBehind ? ` ${aheadBehind.behind} $(arrow-down) ${aheadBehind.ahead} $(arrow-up)` : ''),
                command: GIT_COMMANDS.SYNC.id,
                tooltip: 'Synchronize Changes'
            };
        }
        return {
            text: '$(cloud-upload)',
            command: GIT_COMMANDS.PUBLISH.id,
            tooltip: 'Publish Changes'
        };
    }

    registerScmTitleCommands(registry: ScmTitleCommandRegistry): void {
        registry.registerCommand({ command: GIT_COMMANDS.REFRESH.id });
        registry.registerCommand({ command: GIT_COMMANDS.COMMIT_ADD_SIGN_OFF.id });
    }

    registerScmResourceCommands(registry: ScmResourceCommandRegistry): void {
        registry.registerCommands('Changes', [GIT_COMMANDS.OPEN_CHANGED_FILE.id, GIT_COMMANDS.DISCARD.id, GIT_COMMANDS.STAGE.id]);
        registry.registerCommands('Staged changes', [GIT_COMMANDS.OPEN_CHANGED_FILE.id, GIT_COMMANDS.UNSTAGE.id]);
        registry.registerCommands('Merged Changes', [GIT_COMMANDS.OPEN_CHANGED_FILE.id, GIT_COMMANDS.DISCARD.id, GIT_COMMANDS.STAGE.id]);
    }

    registerScmGroupCommands(registry: ScmGroupCommandRegistry): void {
        registry.registerCommands('Changes', [GIT_COMMANDS.DISCARD_ALL.id, GIT_COMMANDS.STAGE_ALL.id]);
        registry.registerCommands('Staged changes', [GIT_COMMANDS.UNSTAGE_ALL.id]);
        registry.registerCommands('Merged Changes', [GIT_COMMANDS.STAGE_ALL.id]);
    }
}
export interface GitOpenFileOptions {
    readonly uri: URI
    readonly options?: EditorOpenerOptions
}
export interface GitOpenChangesOptions {
    readonly change: GitFileChange
    readonly options?: EditorOpenerOptions
}

export class ScmProviderImpl implements ScmProvider {
    private static ID = 0;

    private onDidChangeEmitter = new Emitter<void>();
    private onDidChangeResourcesEmitter = new Emitter<void>();
    private onDidChangeCommitTemplateEmitter = new Emitter<string>();
    private onDidChangeStatusBarCommandsEmitter = new Emitter<ScmCommand[]>();
    private disposableCollection: DisposableCollection = new DisposableCollection();
    private _groups: ScmResourceGroup[];
    private _count: number | undefined;
    readonly handle = 0;

    constructor(
        private _contextValue: string,
        private _label: string,
        private _rootUri: string | undefined,
        private _amendSupport: ScmAmendSupport,
    ) {
        this.disposableCollection.push(this.onDidChangeEmitter);
        this.disposableCollection.push(this.onDidChangeResourcesEmitter);
        this.disposableCollection.push(this.onDidChangeCommitTemplateEmitter);
        this.disposableCollection.push(this.onDidChangeStatusBarCommandsEmitter);
    }

    private _id = `scm${ScmProviderImpl.ID++}`;

    get id(): string {
        return this._id;
    }
    get groups(): ScmResourceGroup[] {
        return this._groups;
    }

    set groups(groups: ScmResourceGroup[]) {
        this._groups = groups;
    }

    get label(): string {
        return this._label;
    }

    get rootUri(): string | undefined {
        return this._rootUri;
    }

    get contextValue(): string {
        return this._contextValue;
    }

    get onDidChangeResources(): Event<void> {
        return this.onDidChangeResourcesEmitter.event;
    }

    get commitTemplate(): string | undefined {
        return undefined;
    }

    get acceptInputCommand(): ScmCommand | undefined {
        return GIT_COMMANDS.COMMIT;
    }

    get statusBarCommands(): ScmCommand[] | undefined {
        return undefined;
    }

    get count(): number | undefined {
        return this._count;
    }

    set count(count: number | undefined) {
        this._count = count;
    }

    get onDidChangeCommitTemplate(): Event<string> {
        return this.onDidChangeCommitTemplateEmitter.event;
    }

    get onDidChangeStatusBarCommands(): Event<ScmCommand[]> {
        return this.onDidChangeStatusBarCommandsEmitter.event;
    }

    get onDidChange(): Event<void> {
        return this.onDidChangeEmitter.event;
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }

    async getOriginalResource(uri: URI): Promise<URI | undefined> {
        return undefined;
    }

    fireChangeStatusBarCommands(commands: ScmCommand[]): void {
        this.onDidChangeStatusBarCommandsEmitter.fire(commands);
    }

    fireChangeResources(): void {
        this.onDidChangeResourcesEmitter.fire(undefined);
    }

    fireChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    get amendSupport(): ScmAmendSupport | undefined {
        return this._amendSupport;
    }
}

export class GitAmendSupport implements ScmAmendSupport {

    constructor(protected readonly repository: Repository, protected readonly git: Git) { }

    public async getIntialAmendingCommits(storedState: string, lastHead: string): Promise<ScmCommit[]> {
        const { amendingHeadCommitSha } = JSON.parse(storedState);
        const commits = await this.git.log(
            this.repository,
            {
                range: { toRevision: amendingHeadCommitSha, fromRevision: lastHead },
                maxCount: 50
            }
        );

        return commits.map(this.createScmCommit);
    }

    public async getMessage(commit: string): Promise<string> {
        return (await this.git.exec(this.repository, ['log', '-n', '1', '--format=%B', commit])).stdout.trim();
    }

    public async reset(commit: string): Promise<void> {
        await this.git.exec(this.repository, ['reset', commit, '--soft']);
    }

    public async getLastCommit(): Promise<ScmCommit | undefined> {
        const commits = await this.git.log(this.repository, { maxCount: 1, shortSha: true });
        if (commits.length > 0) {
            return this.createScmCommit(commits[0]);
        }
    }

    private createScmCommit(gitCommit: CommitWithChanges) {
        return {
            id: gitCommit.sha,
            summary: gitCommit.summary,
            authorName: gitCommit.author.name,
            authorEmail: gitCommit.author.email,
            authorDateRelative: gitCommit.authorDateRelative
        };
    }
}
