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
import { Command, CommandContribution, CommandRegistry, DisposableCollection, MenuContribution, MenuModelRegistry, Mutable, MenuAction } from '@theia/core';
import { DiffUris, Widget } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry, TabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { EDITOR_CONTEXT_MENU, EditorContextMenu, EditorManager, EditorOpenerOptions, EditorWidget } from '@theia/editor/lib/browser';
import { Hg, HgFileChange, HgFileStatus } from '../common';
import { HgRepositoryTracker } from './hg-repository-tracker';
import { HgAction, HgQuickOpenService } from './hg-quick-open-service';
import { HgSyncService } from './hg-sync-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { HgRepositoryProvider } from './hg-repository-provider';
import { HgErrorHandler } from './hg-error-handler';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { ScmResource, ScmCommand } from '@theia/scm/lib/browser/scm-provider';

export const EDITOR_CONTEXT_MENU_HG = [...EDITOR_CONTEXT_MENU, '3_hg'];

export namespace HG_COMMANDS {
    export const CLONE = {
        id: 'hg.clone',
        label: 'Hg: Clone...'
    };
    export const PULL_DEFAULT = {
        id: 'hg.pull.default',
        label: 'Hg: Pull'
    };
    export const PUSH_DEFAULT = {
        id: 'hg.push.default',
        label: 'Hg: Push'
    };
    export const PUSH = {
        id: 'hg.push',
        label: 'Hg: Push to...'
    };
    export const MERGE_HEADS = {
        id: 'hg.merge',
        label: 'Hg: Merge Heads'
    };
    export const CHECKOUT = {
        id: 'hg.checkout',
        label: 'Hg: Checkout'
    };
    export const COMMIT = {
        id: 'hg.commit.all',
        tooltip: 'Commit all the changes',
        iconClass: 'fa fa-check',
        label: 'Commit',
    };
    export const COMMIT_ADD_SIGN_OFF = {
        id: 'hg-commit-add-sign-off',
        label: 'Add Signed-off-by',
        iconClass: 'fa fa-pencil-square-o',
        category: 'Hg'
    };
    export const COMMIT_AMEND = {
        id: 'hg.commit.amend'
    };
    export const COMMIT_SIGN_OFF = {
        id: 'hg.commit.signOff'
    };
    export const OPEN_FILE: Command = {
        id: 'hg.open.file',
        category: 'Hg',
        label: 'Open File',
        iconClass: 'theia-open-file-icon'
    };
    export const OPEN_CHANGED_FILE: Command = {
        id: 'hg.open.changed.file',
        category: 'Hg',
        label: 'Open File',
        iconClass: 'open-file'
    };
    export const OPEN_CHANGES: Command = {
        id: 'hg.open.changes',
        category: 'Hg',
        label: 'Open Changes',
        iconClass: 'theia-open-change-icon'
    };
    export const SYNC = {
        id: 'hg.sync',
        label: 'Hg: Sync'
    };
    export const PUBLISH = {
        id: 'hg.publish',
        label: 'Hg: Publish Branch'
    };
    export const TRACK = {
        id: 'hg.track',
        category: 'Hg',
        label: 'Track File',
        iconClass: 'fa fa-plus'
    };
    export const TRACK_ALL = {
        id: 'hg.track.all',
        category: 'Hg',
        label: 'Track All Files',
        iconClass: 'fa fa-plus',
    };
    export const UNTRACK = {
        id: 'hg.untrack',
        iconClass: 'fa fa-minus',
        category: 'Hg',
        label: 'Forget File'
    };
    export const DISCARD = {
        id: 'hg.discard',
        iconClass: 'fa fa-undo',
        category: 'Hg',
        label: 'Discard Changes'
    };
    export const DISCARD_ALL = {
        id: 'hg.discard.all',
        iconClass: 'fa fa-undo',
        category: 'Hg',
        label: 'Discard All Changes',
    };
    export const REFRESH = {
        id: 'hg-refresh',
        label: 'Refresh',
        iconClass: 'fa fa-refresh',
        category: 'Hg'
    };
}

@injectable()
export class HgContribution implements CommandContribution, MenuContribution, TabBarToolbarContribution {

    static HG_CHECKOUT = 'hg.checkout';
    static HG_SYNC_STATUS = 'hg-sync-status';

    protected toDispose = new DisposableCollection();

    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(HgQuickOpenService) protected readonly quickOpenService: HgQuickOpenService;
    @inject(HgRepositoryTracker) protected readonly repositoryTracker: HgRepositoryTracker;
    @inject(HgSyncService) protected readonly syncService: HgSyncService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(HgRepositoryProvider) protected readonly repositoryProvider: HgRepositoryProvider;
    @inject(Hg) protected readonly hg: Hg;
    @inject(HgErrorHandler) protected readonly hgErrorHandler: HgErrorHandler;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;

    onStart(): void {
        this.updateStatusBar();
        this.repositoryTracker.onHgEvent(() => this.updateStatusBar());
        this.syncService.onDidChange(() => this.updateStatusBar());
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: HG_COMMANDS.OPEN_FILE.id
        });
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: HG_COMMANDS.OPEN_CHANGES.id
        });

        const registerResourceAction = (group: string, action: MenuAction) => {
            menus.registerMenuAction(ScmWidget.RESOURCE_INLINE_MENU, action);
            menus.registerMenuAction([...ScmWidget.RESOURCE_CONTEXT_MENU, group], action);
        };

        registerResourceAction('navigation', {
            commandId: HG_COMMANDS.OPEN_CHANGED_FILE.id,
            when: 'scmProvider == hg && scmResourceGroup == untracked'
        });
        registerResourceAction('1_modification', {
            commandId: HG_COMMANDS.DISCARD.id,
            when: 'scmProvider == hg && scmResourceGroup == untracked'
        });
        registerResourceAction('1_modification', {
            commandId: HG_COMMANDS.TRACK.id,
            when: 'scmProvider == hg && scmResourceGroup == untracked'
        });
        registerResourceAction('1_modification', {
            commandId: HG_COMMANDS.DISCARD.id,
            when: 'scmProvider == hg && scmResourceGroup == changed'
        });

        registerResourceAction('navigation', {
            commandId: HG_COMMANDS.OPEN_CHANGED_FILE.id,
            when: 'scmProvider == hg && scmResourceGroup == changed'
        });
        // currently not shown
        registerResourceAction('1_modification', {
            commandId: HG_COMMANDS.UNTRACK.id,
            when: 'scmProvider == hg && false'
        });

        registerResourceAction('navigation', {
            commandId: HG_COMMANDS.OPEN_CHANGED_FILE.id,
            when: 'scmProvider == hg && scmResourceGroup == merge'
        });
        registerResourceAction('1_modification', {
            commandId: HG_COMMANDS.DISCARD.id,
            when: 'scmProvider == hg && scmResourceGroup == merge'
        });
        registerResourceAction('1_modification', {
            commandId: HG_COMMANDS.TRACK.id,
            when: 'scmProvider == hg && scmResourceGroup == merge'
        });

        const registerResourceGroupAction = (group: string, action: MenuAction) => {
            menus.registerMenuAction(ScmWidget.RESOURCE_GROUP_INLINE_MENU, action);
            menus.registerMenuAction([...ScmWidget.RESOURCE_GROUP_CONTEXT_MENU, group], action);
        };

        registerResourceGroupAction('1_modification', {
            commandId: HG_COMMANDS.TRACK_ALL.id,
            when: 'scmProvider == hg && scmResourceGroup == merge',
        });
        registerResourceGroupAction('1_modification', {
            commandId: HG_COMMANDS.TRACK_ALL.id,
            when: 'scmProvider == hg && scmResourceGroup == untracked',
        });
        registerResourceGroupAction('1_modification', {
            commandId: HG_COMMANDS.DISCARD_ALL.id,
            when: 'scmProvider == hg && scmResourceGroup == untracked',
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(HG_COMMANDS.PULL_DEFAULT, {
            execute: () => this.quickOpenService.performDefaultHgAction(HgAction.PULL),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.PUSH_DEFAULT, {
            execute: () => this.quickOpenService.performDefaultHgAction(HgAction.PUSH),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.PUSH, {
            execute: () => this.quickOpenService.push(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.MERGE_HEADS, {
            execute: () => this.quickOpenService.mergeHeads(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.CHECKOUT, {
            execute: () => this.quickOpenService.checkout(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.COMMIT_SIGN_OFF, {
            execute: () => this.commit({ signOff: true }),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.COMMIT_AMEND, {
            execute: async () => {
                try {
                    const message = await this.quickOpenService.commitMessageForAmend();
                    await this.commit({ message, amend: true });
                } catch (e) {
                    if (!(e instanceof Error) || e.message !== 'User abort.') {
                        throw e;
                    }
                }
            },
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.TRACK_ALL, {
            execute: () => {
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.trackAll();
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(HG_COMMANDS.DISCARD_ALL, {
            execute: () => {
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.discardAll();
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(HG_COMMANDS.OPEN_FILE, {
            execute: widget => this.openFile(widget),
            isEnabled: widget => !!this.getOpenFileOptions(widget),
            isVisible: widget => !!this.getOpenFileOptions(widget)
        });
        registry.registerCommand(HG_COMMANDS.OPEN_CHANGES, {
            execute: widget => this.openChanges(widget),
            isEnabled: widget => !!this.getOpenChangesOptions(widget),
            isVisible: widget => !!this.getOpenChangesOptions(widget)
        });
        registry.registerCommand(HG_COMMANDS.SYNC, {
            execute: () => this.syncService.sync(),
            isEnabled: () => this.syncService.canSync(),
            isVisible: () => this.syncService.canSync()
        });
        registry.registerCommand(HG_COMMANDS.PUBLISH, {
            execute: () => this.syncService.publish(),
            isEnabled: () => this.syncService.canPublish(),
            isVisible: () => this.syncService.canPublish()
        });
        registry.registerCommand(HG_COMMANDS.CLONE, {
            isEnabled: () => this.workspaceService.opened,
            execute: (url?: string, folder?: string, branch?: string) =>
                this.quickOpenService.clone(url, folder, branch)
        });
        registry.registerCommand(HG_COMMANDS.COMMIT, {
            execute: () => this.commit(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.REFRESH, {
            execute: () => this.repositoryProvider.refresh()
        });
        registry.registerCommand(HG_COMMANDS.COMMIT_ADD_SIGN_OFF, {
            execute: async () => this.addSignOff(),
            isEnabled: () => !!this.repositoryTracker.selectedRepository
        });
        registry.registerCommand(HG_COMMANDS.UNTRACK, {
            execute: (arg: string | ScmResource) => {
                const uri = typeof arg === 'string' ? arg : arg.sourceUri.toString();
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.untrack(uri);
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(HG_COMMANDS.TRACK, {
            execute: (arg: string | ScmResource) => {
                const uri = typeof arg === 'string' ? arg : arg.sourceUri.toString();
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.track(uri);
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(HG_COMMANDS.DISCARD, {
            execute: (arg: string | ScmResource) => {
                const uri = typeof arg === 'string' ? arg : arg.sourceUri.toString();
                const provider = this.repositoryProvider.selectedScmProvider;
                return provider && provider.discard(uri);
            },
            isEnabled: () => !!this.repositoryProvider.selectedScmProvider
        });
        registry.registerCommand(HG_COMMANDS.OPEN_CHANGED_FILE, {
            execute: (arg: string | ScmResource) => {
                const uri = typeof arg === 'string' ? new URI(arg) : arg.sourceUri;
                this.editorManager.open(uri, { mode: 'reveal' });
            }
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: HG_COMMANDS.OPEN_FILE.id,
            command: HG_COMMANDS.OPEN_FILE.id,
            tooltip: HG_COMMANDS.OPEN_FILE.label
        });
        registry.registerItem({
            id: HG_COMMANDS.OPEN_CHANGES.id,
            command: HG_COMMANDS.OPEN_CHANGES.id,
            tooltip: HG_COMMANDS.OPEN_CHANGES.label
        });

        const registerItem = (item: Mutable<TabBarToolbarItem>) => {
            const commandId = item.command;
            const id = '__hg.tabbar.toolbar.' + commandId;
            const command = this.commands.getCommand(commandId);
            this.commands.registerCommand({ id, iconClass: command && command.iconClass }, {
                execute: (widget, ...args) => widget instanceof ScmWidget && !!this.repositoryProvider.selectedScmRepository && this.commands.executeCommand(commandId, ...args),
                isEnabled: (widget, ...args) => widget instanceof ScmWidget && !!this.repositoryProvider.selectedScmRepository && this.commands.isEnabled(commandId, ...args),
                isVisible: (widget, ...args) => widget instanceof ScmWidget && !!this.repositoryProvider.selectedScmRepository && this.commands.isVisible(commandId, ...args),
            });
            item.command = id;
            registry.registerItem(item);
        };

        registerItem({
            id: HG_COMMANDS.COMMIT.id,
            command: HG_COMMANDS.COMMIT.id,
            tooltip: HG_COMMANDS.COMMIT.label
        });
        registerItem({
            id: HG_COMMANDS.REFRESH.id,
            command: HG_COMMANDS.REFRESH.id,
            tooltip: HG_COMMANDS.REFRESH.label
        });
        registerItem({
            id: HG_COMMANDS.COMMIT_ADD_SIGN_OFF.id,
            command: HG_COMMANDS.COMMIT_ADD_SIGN_OFF.id,
            tooltip: HG_COMMANDS.COMMIT_ADD_SIGN_OFF.label
        });
        // registerItem({
        //     id: HG_COMMANDS.COMMIT_AMEND.id,
        //     command: HG_COMMANDS.COMMIT_AMEND.id,
        //     tooltip: 'Commit (Amend)',
        //     group: '1_input'
        // });
        registerItem({
            id: HG_COMMANDS.COMMIT_SIGN_OFF.id,
            command: HG_COMMANDS.COMMIT_SIGN_OFF.id,
            tooltip: 'Commit (Signed Off)',
            group: '1_input'
        });
        [HG_COMMANDS.PULL_DEFAULT, HG_COMMANDS.PUSH_DEFAULT, HG_COMMANDS.PUSH].forEach(command =>
            registerItem({
                id: command.id,
                command: command.id,
                tooltip: command.label.slice('Hg: '.length),
                group: '2_other'
            })
        );
        [HG_COMMANDS.MERGE_HEADS].forEach(command =>
            registerItem({
                id: command.id,
                command: command.id,
                tooltip: command.label.slice('Hg: '.length),
                group: '3_other'
            })
        );
        registerItem({
            id: HG_COMMANDS.TRACK_ALL.id,
            command: HG_COMMANDS.TRACK_ALL.id,
            tooltip: 'Track All Files',
            group: '4_batch'
        });
        registerItem({
            id: HG_COMMANDS.DISCARD_ALL.id,
            command: HG_COMMANDS.DISCARD_ALL.id,
            tooltip: 'Discard All Changes',
            group: '4_batch'
        });
    }

    protected allChanged(changes: HgFileChange[]): boolean {
        return !changes.some(c => c.status !== HgFileStatus.Untracked);
    }

    protected async openFile(widget?: Widget): Promise<EditorWidget | undefined> {
        const options = this.getOpenFileOptions(widget);
        return options && this.editorManager.open(options.uri, options.options);
    }

    protected getOpenFileOptions(widget?: Widget): HgOpenFileOptions | undefined {
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
        const options = this.getOpenChangesOptions(widget);
        if (options) {
            const provider = this.repositoryProvider.selectedScmProvider;
            return provider && provider.openChange(options.change, options.options);
        }
        return undefined;
    }

    protected getOpenChangesOptions(widget?: Widget): HgOpenChangesOptions | undefined {
        const provider = this.repositoryProvider.selectedScmProvider;
        if (!provider) {
            return undefined;
        }
        const ref = widget ? widget : this.editorManager.currentEditor;
        if (ref instanceof EditorWidget && !DiffUris.isDiffUri(ref.editor.uri)) {
            const uri = ref.editor.uri;
            const change = provider.findChange(uri);
            if (change && provider.getUriToOpen(change).toString() !== uri.toString()) {
                const selection = ref.editor.selection;
                return { change, options: { selection, widgetOptions: { ref } } };
            }
        }
        return undefined;
    }

    protected updateStatusBar(): void {
        const scmProvider = this.repositoryProvider.selectedScmProvider;
        if (!scmProvider) {
            return;
        }
        const statusBarCommands: ScmCommand[] = [];

        const checkoutCommand = this.getCheckoutStatusBarCommand();
        if (checkoutCommand) {
            statusBarCommands.push(checkoutCommand);
        }

        const syncCommand = this.getSyncStatusBarCommand();
        if (syncCommand) {
            statusBarCommands.push(syncCommand);
        }
        scmProvider.statusBarCommands = statusBarCommands;
    }
    protected getCheckoutStatusBarCommand(): ScmCommand | undefined {
        const scmProvider = this.repositoryProvider.selectedScmProvider;
        if (!scmProvider) {
            return undefined;
        }
        const status = scmProvider.getStatus();
        if (!status) {
            return undefined;
        }
        const branch = status.branch ? status.branch : status.currentHead ? status.currentHead.substring(0, 8) : 'NO-HEAD';
        const changes = (scmProvider.untrackedChanges.length > 0 ? '*' : '')
            + (scmProvider.changes.length > 0 ? '+' : '')
            + (scmProvider.mergeChanges.length > 0 ? '!' : '');
        return {
            command: HG_COMMANDS.CHECKOUT.id,
            title: `$(code-fork) ${branch}${changes}`,
            tooltip: 'Checkout...'
        };
    }
    protected getSyncStatusBarCommand(): ScmCommand | undefined {
        const status = this.repositoryTracker.selectedRepositoryStatus;
        if (!status || !status.branch) {
            return undefined;
        }
        if (this.syncService.isSyncing()) {
            return {
                title: '$(refresh~spin)',
                tooltip: 'Synchronizing Changes...'
            };
        }
        const { upstreamBranch, aheadBehind } = status;
        if (upstreamBranch) {
            return {
                title: '$(refresh)' + (aheadBehind && (aheadBehind.ahead + aheadBehind.behind) > 0 ? ` ${aheadBehind.behind}↓ ${aheadBehind.ahead}↑` : ''),
                command: HG_COMMANDS.SYNC.id,
                tooltip: 'Synchronize Changes'
            };
        }
        return {
            title: '$(cloud-upload)',
            command: HG_COMMANDS.PUBLISH.id,
            tooltip: 'Publish Changes'
        };
    }

    async commit(options: Hg.Options.Commit & { message?: string } = {}): Promise<void> {
        const scmRepository = this.repositoryProvider.selectedScmRepository;
        if (!scmRepository) {
            return;
        }
        const message = options.message || scmRepository.input.value;
        if (!message.trim()) {
            scmRepository.input.issue = {
                type: 'error',
                message: 'Please provide a commit message'
            };
            scmRepository.input.focus();
            return;
        }
        if (!scmRepository.provider.changes.length) {
            scmRepository.input.issue = {
                type: 'error',
                message: 'No changes added to commit'
            };
            scmRepository.input.focus();
            return;
        }
        scmRepository.input.issue = undefined;
        try {
            // We can make sure, repository exists, otherwise we would not have this button.
            const { signOff, amend } = options;
            const repository = scmRepository.provider.repository;
            await this.hg.commit(repository, message, { signOff, amend });
            scmRepository.input.value = '';
        } catch (error) {
            this.hgErrorHandler.handleError(error);
        }
    }

    async addSignOff(): Promise<void> {
        const scmRepository = this.repositoryProvider.selectedScmRepository;
        if (!scmRepository) {
            return;
        }
        const repository = scmRepository.provider.repository;
        const nameAndEmail = (await this.hg.exec(repository, ['config', 'ui.username']))
            .stdout.trim();

        const signOff = `\n\nSigned-off-by: ${nameAndEmail}`;
        const value = scmRepository.input.value;
        if (value.endsWith(signOff)) {
            scmRepository.input.value = value.substr(0, value.length - signOff.length);
        } else {
            scmRepository.input.value = `${value}${signOff}`;
        }
        scmRepository.input.focus();
    }
}
export interface HgOpenFileOptions {
    readonly uri: URI
    readonly options?: EditorOpenerOptions
}
export interface HgOpenChangesOptions {
    readonly change: HgFileChange
    readonly options?: EditorOpenerOptions
}
