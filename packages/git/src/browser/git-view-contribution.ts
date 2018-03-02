/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { DisposableCollection, CommandRegistry, MenuModelRegistry } from '@theia/core';
import { AbstractViewContribution, StatusBar, StatusBarAlignment, DiffUris } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget, EditorOpenerOptions, EditorContextMenu, EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { GitFileChange } from '../common';
import { GitWidget, GIT_WIDGET_CONTEXT_MENU } from './git-widget';
import { GitRepositoryTracker } from './git-repository-tracker';
import { GitQuickOpenService } from './git-quick-open-service';

export const GIT_WIDGET_FACTORY_ID = 'git';

const GIT_SELECTED_REPOSITORY = 'git-selected-repository';
const GIT_REPOSITORY_STATUS = 'git-repository-status';
const GIT_AHEAD_BEHIND = 'git-ahead-behind';

export const EDITOR_CONTEXT_MENU_GIT = [...EDITOR_CONTEXT_MENU, '3_git'];

export namespace GIT_COMMANDS {
    export const FETCH = {
        id: 'git.fetch',
        label: 'Git: Fetch'
    };
    export const PULL = {
        id: 'git.pull',
        label: 'Git: Pull'
    };
    export const PUSH = {
        id: 'git.push',
        label: 'Git: Push'
    };
    export const MERGE = {
        id: 'git.merge',
        label: 'Git: Merge'
    };
    export const CHECKOUT = {
        id: 'git.checkout',
        label: 'Git: Checkout'
    };
    export const CHANGE_REPOSITORY = {
        id: 'git.change.repository',
        label: 'Git: Change Repository'
    };
    export const OPEN_FILE = {
        id: 'git.open.file',
        label: 'Git: Open File'
    };
    export const OPEN_CHANGES = {
        id: 'git.open.changes',
        label: 'Git: Open Changes'
    };
}

@injectable()
export class GitViewContribution extends AbstractViewContribution<GitWidget> {

    protected toDispose = new DisposableCollection();

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(GitQuickOpenService) protected readonly quickOpenService: GitQuickOpenService;
    @inject(GitRepositoryTracker) protected readonly repositoryTracker: GitRepositoryTracker;

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

    onStart() {
        this.repositoryTracker.onDidChangeRepository(repository => {
            if (repository && this.hasMultipleRepositories()) {
                const path = new URI(repository.localUri).path;
                this.statusBar.setElement(GIT_SELECTED_REPOSITORY, {
                    text: `$(database) ${path.base}`,
                    alignment: StatusBarAlignment.LEFT,
                    priority: 102,
                    command: GIT_COMMANDS.CHANGE_REPOSITORY.id,
                    tooltip: path.toString()
                });
            } else {
                this.statusBar.removeElement(GIT_SELECTED_REPOSITORY);
            }
        });
        this.repositoryTracker.onGitEvent(event => {
            const { status } = event;
            const branch = status.branch ? status.branch : 'NO-HEAD';
            const dirty = status.changes.length > 0 ? '*' : '';
            this.statusBar.setElement(GIT_REPOSITORY_STATUS, {
                text: `$(code-fork) ${branch}${dirty}`,
                alignment: StatusBarAlignment.LEFT,
                priority: 101,
                command: GIT_COMMANDS.CHECKOUT.id
            });
            if (status.aheadBehind === undefined) {
                this.statusBar.removeElement(GIT_AHEAD_BEHIND);
            } else {
                const { ahead, behind } = status.aheadBehind;
                if (ahead > 0 || behind > 0) {
                    this.statusBar.setElement(GIT_AHEAD_BEHIND, {
                        text: `${behind}↓ ${ahead}↑`,
                        alignment: StatusBarAlignment.LEFT,
                        priority: 100
                    });
                } else {
                    this.statusBar.removeElement(GIT_AHEAD_BEHIND);
                }
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        const commands = [GIT_COMMANDS.FETCH, GIT_COMMANDS.PULL, GIT_COMMANDS.PUSH, GIT_COMMANDS.MERGE];
        commands.forEach(command =>
            menus.registerMenuAction(GIT_WIDGET_CONTEXT_MENU, {
                commandId: command.id,
                label: command.label.slice('Git: '.length) + '...'
            })
        );
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
}
