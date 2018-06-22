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
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { DisposableCollection, CommandRegistry, MenuModelRegistry } from '@theia/core';
import { AbstractViewContribution, StatusBar, StatusBarAlignment, DiffUris, StatusBarEntry, FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget, EditorOpenerOptions, EditorContextMenu, EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { GitFileChange, GitFileStatus } from '../common';
import { GitWidget } from './git-widget';
import { GitRepositoryTracker } from './git-repository-tracker';
import { GitQuickOpenService } from './git-quick-open-service';
import { GitSyncService } from './git-sync-service';

export const GIT_WIDGET_FACTORY_ID = 'git';

export const EDITOR_CONTEXT_MENU_GIT = [...EDITOR_CONTEXT_MENU, '3_git'];

export namespace GIT_COMMANDS {
    export const FETCH = {
        id: 'git.fetch',
        label: 'Git: Fetch...'
    };
    export const PULL = {
        id: 'git.pull',
        label: 'Git: Pull...'
    };
    export const PUSH = {
        id: 'git.push',
        label: 'Git: Push...'
    };
    export const MERGE = {
        id: 'git.merge',
        label: 'Git: Merge...'
    };
    export const CHECKOUT = {
        id: 'git.checkout',
        label: 'Git: Checkout'
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
    export const OPEN_FILE = {
        id: 'git.open.file',
        label: 'Git: Open File'
    };
    export const OPEN_CHANGES = {
        id: 'git.open.changes',
        label: 'Git: Open Changes'
    };
    export const SYNC = {
        id: 'git.sync',
        label: 'Git: Sync'
    };
    export const PUBLISH = {
        id: 'git.publish',
        label: 'Git: Publish Branch'
    };
}

@injectable()
export class GitViewContribution extends AbstractViewContribution<GitWidget> implements FrontendApplicationContribution {

    static GIT_SELECTED_REPOSITORY = 'git-selected-repository';
    static GIT_REPOSITORY_STATUS = 'git-repository-status';
    static GIT_SYNC_STATUS = 'git-sync-status';

    protected toDispose = new DisposableCollection();

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(GitQuickOpenService) protected readonly quickOpenService: GitQuickOpenService;
    @inject(GitRepositoryTracker) protected readonly repositoryTracker: GitRepositoryTracker;
    @inject(GitSyncService) protected readonly syncService: GitSyncService;

    constructor() {
        super({
            widgetId: GIT_WIDGET_FACTORY_ID,
            widgetName: 'Git',
            defaultWidgetOptions: {
                area: 'left',
                rank: 200
            },
            toggleCommandId: 'gitView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+g'
        });
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView();
    }

    onStart(): void {
        this.repositoryTracker.onDidChangeRepository(repository => {
            if (repository && this.hasMultipleRepositories()) {
                const path = new URI(repository.localUri).path;
                this.statusBar.setElement(GitViewContribution.GIT_SELECTED_REPOSITORY, {
                    text: `$(database) ${path.base}`,
                    alignment: StatusBarAlignment.LEFT,
                    priority: 102,
                    command: GIT_COMMANDS.CHANGE_REPOSITORY.id,
                    tooltip: path.toString()
                });
            } else {
                this.statusBar.removeElement(GitViewContribution.GIT_SELECTED_REPOSITORY);
            }
        });
        this.repositoryTracker.onGitEvent(event => {
            const { status } = event;
            const branch = status.branch ? status.branch : 'NO-HEAD';
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
            this.statusBar.setElement(GitViewContribution.GIT_REPOSITORY_STATUS, {
                text: `$(code-fork) ${branch}${dirty}`,
                alignment: StatusBarAlignment.LEFT,
                priority: 101,
                command: GIT_COMMANDS.CHECKOUT.id
            });
            this.updateSyncStatusBarEntry();
        });
        this.syncService.onDidChange(() => this.updateSyncStatusBarEntry());
    }

    registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        [GIT_COMMANDS.FETCH, GIT_COMMANDS.PULL, GIT_COMMANDS.PUSH, GIT_COMMANDS.MERGE].forEach(command =>
            menus.registerMenuAction(GitWidget.ContextMenu.OTHER_GROUP, {
                commandId: command.id,
                label: command.label.slice('Git: '.length)
            })
        );
        menus.registerMenuAction(GitWidget.ContextMenu.COMMIT_GROUP, {
            commandId: GIT_COMMANDS.COMMIT_AMEND.id,
            label: 'Commit (Amend)'
        });
        menus.registerMenuAction(GitWidget.ContextMenu.COMMIT_GROUP, {
            commandId: GIT_COMMANDS.COMMIT_SIGN_OFF.id,
            label: 'Commit (Signed Off)'
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: GIT_COMMANDS.OPEN_FILE.id
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: GIT_COMMANDS.OPEN_CHANGES.id
        });
    }

    registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(GIT_COMMANDS.FETCH, {
            execute: () => this.quickOpenService.fetch(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.PULL, {
            execute: () => this.quickOpenService.pull(),
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
            execute: () => this.tryGetWidget()!.doCommit(this.repositoryTracker.selectedRepository, 'sign-off'),
            isEnabled: () => !!this.tryGetWidget() && !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.COMMIT_AMEND, {
            execute: async () => {
                const widget = this.tryGetWidget();
                const { selectedRepository } = this.repositoryTracker;
                if (!!widget && !!selectedRepository) {
                    try {
                        const message = await this.quickOpenService.commitMessageForAmend();
                        widget.doCommit(selectedRepository, 'amend', message);
                    } catch (e) {
                        if (!(e instanceof Error) || e.message !== 'User abort.') {
                            throw e;
                        }
                    }
                }
            },
            isEnabled: () => !!this.tryGetWidget() && !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(GIT_COMMANDS.CHANGE_REPOSITORY, {
            execute: () => this.quickOpenService.changeRepository(),
            isEnabled: () => this.hasMultipleRepositories()
        });
        registry.registerCommand(GIT_COMMANDS.OPEN_FILE, {
            execute: () => this.openFile(),
            isEnabled: () => !!this.openFileOptions,
            isVisible: () => !!this.openFileOptions
        });
        registry.registerCommand(GIT_COMMANDS.OPEN_CHANGES, {
            execute: () => this.openChanges(),
            isEnabled: () => !!this.openChangesOptions,
            isVisible: () => !!this.openChangesOptions
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
    }

    protected hasConflicts(changes: GitFileChange[]): boolean {
        return changes.some(c => c.status === GitFileStatus.Conflicted);
    }

    protected allStaged(changes: GitFileChange[]): boolean {
        return !changes.some(c => !c.staged);
    }

    protected async openFile(): Promise<EditorWidget | undefined> {
        const options = this.openFileOptions;
        return options && this.editorManager.open(options.uri, options.options);
    }

    protected get openFileOptions(): { uri: URI, options?: EditorOpenerOptions } | undefined {
        const widget = this.editorManager.currentEditor;
        if (widget && DiffUris.isDiffUri(widget.editor.uri)) {
            const [, right] = DiffUris.decode(widget.editor.uri);
            const uri = right.withScheme('file');
            const selection = widget.editor.selection;
            return { uri, options: { selection } };
        }
        return undefined;
    }

    async openChanges(): Promise<EditorWidget | undefined> {
        const options = this.openChangesOptions;
        if (options) {
            const view = await this.widget;
            return view.openChange(options.change, options.options);
        }
        return undefined;
    }

    protected get openChangesOptions(): { change: GitFileChange, options?: EditorOpenerOptions } | undefined {
        const view = this.tryGetWidget();
        if (!view) {
            return undefined;
        }
        const widget = this.editorManager.currentEditor;
        if (widget && !DiffUris.isDiffUri(widget.editor.uri)) {
            const uri = widget.editor.uri;
            const change = view.findChange(uri);
            if (change) {
                const selection = widget.editor.selection;
                return { change, options: { selection } };
            }
        }
        return undefined;
    }

    protected hasMultipleRepositories(): boolean {
        return this.repositoryTracker.allRepositories.length > 1;
    }

    protected updateSyncStatusBarEntry(): void {
        const entry = this.getStatusBarEntry();
        if (entry) {
            this.statusBar.setElement(GitViewContribution.GIT_SYNC_STATUS, {
                alignment: StatusBarAlignment.LEFT,
                priority: 100,
                ...entry
            });
        } else {
            this.statusBar.removeElement(GitViewContribution.GIT_SYNC_STATUS);
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
                text: '$(refresh)' + (aheadBehind ? ` ${aheadBehind.behind}↓ ${aheadBehind.ahead}↑` : ''),
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
}
