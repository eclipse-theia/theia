// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution,
    codicon,
    KeybindingContribution,
    KeybindingRegistry,
    MAXIMIZED_CLASS,
    Widget,
} from '@theia/core/lib/browser';
import { CommandRegistry, Disposable, DisposableCollection, Event, MenuModelRegistry, nls } from '@theia/core';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { BOTTOM_AREA_ID } from '@theia/core/lib/browser/shell/theia-dock-panel';
import { TerminalCommands } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalProfileService } from '@theia/terminal/lib/browser/terminal-profile-service';
import {
    TerminalManagerCommands, TerminalManagerNewTerminalMenus, TerminalManagerTreeTypes, TERMINAL_MANAGER_NEW_TERMINAL_MENU, TERMINAL_MANAGER_TREE_CONTEXT_MENU
} from './terminal-manager-types';
import { TerminalManagerWidget } from './terminal-manager-widget';
import { TerminalManagerTreeWidget } from './terminal-manager-tree-widget';
import { ConfirmDialog, Dialog } from '@theia/core/lib/browser/dialogs';
import { TerminalManagerPreferences } from './terminal-manager-preferences';

@injectable()
export class TerminalManagerFrontendViewContribution extends AbstractViewContribution<TerminalManagerWidget>
    implements TabBarToolbarContribution, KeybindingContribution {

    @inject(TerminalManagerPreferences)
    protected readonly preferences: TerminalManagerPreferences;

    @inject(TerminalProfileService)
    protected readonly profileService: TerminalProfileService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    protected quickViewDisposable: Disposable | undefined;
    protected readonly profileMenuDisposables = new DisposableCollection();

    constructor() {
        super({
            widgetId: TerminalManagerWidget.ID,
            widgetName: nls.localize('theia/terminal-manager', 'Terminal Manager'),
            defaultWidgetOptions: {
                area: 'bottom',
            },
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        // Don't call super.registerCommands() - we manage quick view registration manually
        // based on the terminal.grouping.mode preference

        this.preferences.ready.then(() => {
            this.updateQuickViewRegistration();
            this.preferences.onPreferenceChanged(change => {
                if (change.preferenceName === 'terminal.grouping.mode') {
                    this.updateQuickViewRegistration();
                }
            });
        });

        commands.registerCommand(TerminalManagerCommands.MANAGER_NEW_TERMINAL_GROUP, {
            execute: (
                ...args: TerminalManagerTreeTypes.ContextMenuArgs
            ) => {
                const nodeId = args[1];
                if (TerminalManagerTreeTypes.isPageId(nodeId)) {
                    this.createNewTerminalGroup(nodeId);
                }
            },
            isVisible: (
                ...args: TerminalManagerTreeTypes.ContextMenuArgs
            ) => args[0] instanceof TerminalManagerTreeWidget && TerminalManagerTreeTypes.isPageId(args[1]),
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_SHOW_TREE_TOOLBAR, {
            execute: () => this.handleToggleTree(),
            isVisible: widget => widget instanceof TerminalManagerWidget,
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_NEW_PAGE_BOTTOM_TOOLBAR, {
            execute: () => this.createNewTerminalPage(),
            isVisible: (
                ...args: TerminalManagerTreeTypes.ContextMenuArgs
            ) => args[0] instanceof TerminalManagerWidget,
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_DELETE_TERMINAL, {
            execute: (
                ...args: TerminalManagerTreeTypes.ContextMenuArgs
            ) => TerminalManagerTreeTypes.isTerminalKey(args[1]) && this.deleteTerminalFromManager(args[1]),
            isVisible: (...args: TerminalManagerTreeTypes.ContextMenuArgs) => {
                const treeWidget = args[0];
                const nodeId = args[1];
                if (treeWidget instanceof TerminalManagerTreeWidget && TerminalManagerTreeTypes.isTerminalKey(nodeId)) {
                    const { model } = treeWidget;
                    const terminalNode = model.getNode(nodeId);
                    return TerminalManagerTreeTypes.isTerminalNode(terminalNode);
                }
                return false;
            },
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_DELETE_PAGE, {
            execute: (
                ...args: TerminalManagerTreeTypes.ContextMenuArgs
            ) => TerminalManagerTreeTypes.isPageId(args[1]) && this.deletePageFromManager(args[1]),
            isVisible: (...args: TerminalManagerTreeTypes.ContextMenuArgs) => {
                const widget = args[0];
                return widget instanceof TerminalManagerTreeWidget && TerminalManagerTreeTypes.isPageId(args[1]) && widget.model.pages.size >= 1;
            },
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_RENAME_TERMINAL, {
            execute: (...args: TerminalManagerTreeTypes.ContextMenuArgs) => this.toggleRenameTerminalFromManager(args[1]),
            isVisible: (...args: TerminalManagerTreeTypes.ContextMenuArgs) => args[0] instanceof TerminalManagerTreeWidget,
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_ADD_TERMINAL_TO_GROUP, {
            execute: (
                ...args: TerminalManagerTreeTypes.ContextMenuArgs
            ) => {
                const nodeId = args[1];
                if (TerminalManagerTreeTypes.isGroupId(nodeId)) {
                    this.addTerminalToGroup(nodeId);
                }
            },
            isVisible: (
                ...args: TerminalManagerTreeTypes.ContextMenuArgs
            ) => args[0] instanceof TerminalManagerTreeWidget && TerminalManagerTreeTypes.isGroupId(args[1]),
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_DELETE_GROUP, {
            execute: (
                ...args: TerminalManagerTreeTypes.ContextMenuArgs
            ) => TerminalManagerTreeTypes.isGroupId(args[1]) && this.deleteGroupFromManager(args[1]),
            isVisible: (...args: TerminalManagerTreeTypes.ContextMenuArgs) => {
                const treeWidget = args[0];
                const groupId = args[1];
                if (treeWidget instanceof TerminalManagerTreeWidget && TerminalManagerTreeTypes.isGroupId(groupId)) {
                    const { model } = treeWidget;
                    const groupNode = model.getNode(groupId);
                    return TerminalManagerTreeTypes.isGroupNode(groupNode);
                }
                return false;
            },
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_MAXIMIZE_BOTTOM_PANEL_TOOLBAR, {
            execute: () => this.maximizeBottomPanel(),
            isVisible: widget => widget instanceof Widget
                && widget.parent?.id === BOTTOM_AREA_ID
                && !this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS),
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_MINIMIZE_BOTTOM_PANEL_TOOLBAR, {
            execute: () => this.maximizeBottomPanel(),
            isVisible: widget => widget instanceof Widget
                && widget.parent?.id === BOTTOM_AREA_ID
                && this.shell.bottomPanel.hasClass(MAXIMIZED_CLASS),
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_CLEAR_ALL, {
            isVisible: widget => widget instanceof TerminalManagerWidget,
            execute: async widget => {
                if (widget instanceof TerminalManagerWidget) {
                    const PRIMARY_BUTTON = nls.localize('theia/terminal-manager/resetLayout', 'Reset Layout');
                    const dialogResponse = await this.confirmUserAction({
                        title: nls.localize('theia/terminal-manager/resetLayoutPrompt', 'Do you want to reset the terminal manager layout?'),
                        message: nls.localize(
                            'theia/terminal-manager/resetLayoutMessage',
                            'Once the layout is reset, it cannot be restored. Are you sure you would like to clear the layout?'),
                        primaryButtonText: PRIMARY_BUTTON,
                    });
                    if (dialogResponse === PRIMARY_BUTTON) {
                        widget.resetView();
                    }
                }
            },
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_OPEN_VIEW, {
            execute: () => this.openView({ activate: true }),
            isEnabled: () => this.isTreeMode(),
            isVisible: () => this.isTreeMode(),
        });
        commands.registerCommand(TerminalManagerCommands.MANAGER_CLOSE_VIEW, {
            isVisible: () => Boolean(this.tryGetWidget()),
            isEnabled: () => Boolean(this.tryGetWidget()),
            execute: () => this.closeView(),
        });
    }

    protected isTreeMode(): boolean {
        return this.preferences.get('terminal.grouping.mode') === 'tree';
    }

    protected updateQuickViewRegistration(): void {
        if (this.isTreeMode()) {
            if (!this.quickViewDisposable) {
                this.quickViewDisposable = this.quickView?.registerItem({
                    label: this.viewLabel,
                    open: () => this.openView({ activate: true })
                });
            }
        } else {
            this.quickViewDisposable?.dispose();
            this.quickViewDisposable = undefined;
        }
    }

    protected async confirmUserAction(options: { title: string, message: string, primaryButtonText: string }): Promise<string | undefined> {
        const dialog = new ConfirmDialog({
            title: options.title,
            msg: options.message,
            ok: options.primaryButtonText,
            cancel: Dialog.CANCEL,
        });
        const confirmed = await dialog.open();
        return confirmed ? options.primaryButtonText : undefined;
    }

    protected maximizeBottomPanel(): void {
        this.shell.bottomPanel.toggleMaximized();
    }

    protected async createNewTerminalPage(): Promise<void> {
        const terminalManagerWidget = await this.widget;
        const terminalWidget = await terminalManagerWidget.createTerminalWidget();
        terminalManagerWidget.addTerminalPage(terminalWidget);
    }

    protected async createNewTerminalGroup(pageId: TerminalManagerTreeTypes.PageId): Promise<void> {
        const terminalManagerWidget = await this.widget;
        const terminalWidget = await terminalManagerWidget.createTerminalWidget();
        terminalManagerWidget.addTerminalGroupToPage(terminalWidget, pageId);
    }

    protected async addTerminalToGroup(groupId: TerminalManagerTreeTypes.GroupId): Promise<void> {
        const terminalManagerWidget = await this.widget;
        const terminalWidget = await terminalManagerWidget.createTerminalWidget();
        terminalManagerWidget.addWidgetToTerminalGroup(terminalWidget, groupId);
    }

    protected async handleToggleTree(): Promise<void> {
        const terminalManagerWidget = await this.widget;
        terminalManagerWidget.toggleTreeVisibility();
    }

    protected async deleteTerminalFromManager(terminalId: TerminalManagerTreeTypes.TerminalKey): Promise<void> {
        const terminalManagerWidget = await this.widget;
        terminalManagerWidget?.deleteTerminal(terminalId);
    }

    protected async deleteGroupFromManager(groupId: TerminalManagerTreeTypes.GroupId): Promise<void> {
        const widget = await this.widget;
        widget.deleteGroup(groupId);
    }

    protected async deletePageFromManager(pageId: TerminalManagerTreeTypes.PageId): Promise<void> {
        const widget = await this.widget;
        widget.deletePage(pageId);
    }

    protected async toggleRenameTerminalFromManager(entityId: TerminalManagerTreeTypes.TerminalManagerValidId): Promise<void> {
        const widget = await this.widget;
        widget.toggleRenameTerminal(entityId);
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        this.registerNewTerminalMenu(menus);
        menus.registerMenuAction(TERMINAL_MANAGER_TREE_CONTEXT_MENU, {
            commandId: TerminalManagerCommands.MANAGER_ADD_TERMINAL_TO_GROUP.id,
            order: 'a',
        });
        menus.registerMenuAction(TERMINAL_MANAGER_TREE_CONTEXT_MENU, {
            commandId: TerminalManagerCommands.MANAGER_RENAME_TERMINAL.id,
            order: 'b',
        });
        menus.registerMenuAction(TERMINAL_MANAGER_TREE_CONTEXT_MENU, {
            commandId: TerminalManagerCommands.MANAGER_DELETE_TERMINAL.id,
            order: 'c',
        });
        menus.registerMenuAction(TERMINAL_MANAGER_TREE_CONTEXT_MENU, {
            commandId: TerminalManagerCommands.MANAGER_DELETE_PAGE.id,
            order: 'c',
        });
        menus.registerMenuAction(TERMINAL_MANAGER_TREE_CONTEXT_MENU, {
            commandId: TerminalManagerCommands.MANAGER_DELETE_GROUP.id,
            order: 'c',
        });

        menus.registerMenuAction(TerminalManagerTreeTypes.PAGE_NODE_MENU, {
            commandId: TerminalManagerCommands.MANAGER_NEW_TERMINAL_GROUP.id,
            order: 'a',
        });
        menus.registerMenuAction(TerminalManagerTreeTypes.PAGE_NODE_MENU, {
            commandId: TerminalManagerCommands.MANAGER_DELETE_PAGE.id,
            order: 'b',
        });

        menus.registerMenuAction(TerminalManagerTreeTypes.TERMINAL_NODE_MENU, {
            commandId: TerminalManagerCommands.MANAGER_DELETE_TERMINAL.id,
            order: 'c',
        });

        menus.registerMenuAction(TerminalManagerTreeTypes.GROUP_NODE_MENU, {
            commandId: TerminalManagerCommands.MANAGER_ADD_TERMINAL_TO_GROUP.id,
            order: 'a',
        });
        menus.registerMenuAction(TerminalManagerTreeTypes.GROUP_NODE_MENU, {
            commandId: TerminalManagerCommands.MANAGER_DELETE_GROUP.id,
            order: 'c',
        });
    }

    protected registerNewTerminalMenu(menus: MenuModelRegistry): void {
        menus.registerMenuAction(TerminalManagerNewTerminalMenus.NEW, {
            commandId: TerminalCommands.NEW.id,
            label: nls.localizeByDefault('New Terminal'),
            order: 'a',
        });
        menus.registerMenuAction(TerminalManagerNewTerminalMenus.NEW, {
            commandId: TerminalCommands.SPLIT.id,
            order: 'b',
        });
        menus.registerSubmenu(TerminalManagerNewTerminalMenus.SPLIT_PROFILE, nls.localizeByDefault('Split Terminal with Profile'));
        menus.registerMenuAction(TerminalManagerNewTerminalMenus.CONFIGURE, {
            commandId: TerminalCommands.PROFILE_DEFAULT.id,
            label: nls.localize('theia/terminal/profileDefault', 'Choose Default Profile...'),
        });
        this.updateProfileMenus(menus);
        this.profileService.onAdded(() => this.updateProfileMenus(menus));
        this.profileService.onRemoved(() => this.updateProfileMenus(menus));
        this.profileService.onDidChangeDefaultShell(() => this.updateProfileMenus(menus));
    }

    /**
     * Registers an entry per terminal profile to create a new terminal and to split the active terminal with that profile.
     * Menu items execute their command with the widget as argument, so each entry gets its own command passing the profile ID.
     */
    protected updateProfileMenus(menus: MenuModelRegistry): void {
        this.profileMenuDisposables.dispose();
        const { defaultProfile } = this.profileService;
        this.profileService.all.forEach(([profileId, profile], index) => {
            const order = String(index).padStart(4, '0');
            const profileLabel = profile.label ?? profileId;
            const label = profile === defaultProfile ? nls.localizeByDefault('{0} (Default)', profileLabel) : profileLabel;
            const newCommandId = `terminal-manager:new-with-profile:${profileId}`;
            const splitCommandId = `terminal-manager:split-with-profile:${profileId}`;
            this.profileMenuDisposables.pushAll([
                this.commandRegistry.registerCommand({ id: newCommandId }, {
                    execute: () => this.commandRegistry.executeCommand(TerminalCommands.PROFILE_NEW.id, profileId),
                }),
                this.commandRegistry.registerCommand({ id: splitCommandId }, {
                    execute: () => this.commandRegistry.executeCommand(TerminalCommands.PROFILE_SPLIT.id, profileId),
                }),
                menus.registerMenuAction(TerminalManagerNewTerminalMenus.PROFILES, { commandId: newCommandId, label, order }),
                menus.registerMenuAction(TerminalManagerNewTerminalMenus.SPLIT_PROFILE, { commandId: splitCommandId, label, order }),
            ]);
        });
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: TerminalManagerCommands.MANAGER_NEW_PAGE_BOTTOM_TOOLBAR.id,
            command: TerminalManagerCommands.MANAGER_NEW_PAGE_BOTTOM_TOOLBAR.id,
            menuPath: TERMINAL_MANAGER_NEW_TERMINAL_MENU,
            tooltip: TerminalManagerCommands.MANAGER_NEW_PAGE_BOTTOM_TOOLBAR.label,
            // the command's visibility and label are not considered for toolbar items with a menu
            isVisible: widget => widget instanceof TerminalManagerWidget,
        });
        toolbar.registerItem({
            id: TerminalManagerCommands.MANAGER_SHOW_TREE_TOOLBAR.id,
            command: TerminalManagerCommands.MANAGER_SHOW_TREE_TOOLBAR.id,
        });
        toolbar.registerItem({
            id: TerminalManagerCommands.MANAGER_CLEAR_ALL.id,
            command: TerminalManagerCommands.MANAGER_CLEAR_ALL.id,
        });
        const bottomPanelMaximizationChanged = Event.map(Event.filter(this.shell.onDidToggleMaximized, widget => widget === this.shell.bottomPanel), () => undefined);
        toolbar.registerItem({
            id: TerminalManagerCommands.MANAGER_MAXIMIZE_BOTTOM_PANEL_TOOLBAR.id,
            command: TerminalManagerCommands.MANAGER_MAXIMIZE_BOTTOM_PANEL_TOOLBAR.id,
            icon: codicon('chevron-up'),
            onDidChange: bottomPanelMaximizationChanged,
        });
        toolbar.registerItem({
            id: TerminalManagerCommands.MANAGER_MINIMIZE_BOTTOM_PANEL_TOOLBAR.id,
            command: TerminalManagerCommands.MANAGER_MINIMIZE_BOTTOM_PANEL_TOOLBAR.id,
            icon: codicon('chevron-down'),
            onDidChange: bottomPanelMaximizationChanged,
        });
    }

    override registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: TerminalManagerCommands.MANAGER_MINIMIZE_BOTTOM_PANEL_TOOLBAR.id,
            keybinding: 'alt+q',
        });
    }
}
