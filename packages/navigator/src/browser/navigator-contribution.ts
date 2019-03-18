/********************************************************************************
 * Copyright (C) 2017-2018 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import {
    Navigatable, SelectableTreeNode, Widget, KeybindingRegistry, CommonCommands,
    OpenerService, FrontendApplicationContribution, FrontendApplication, CompositeTreeNode
} from '@theia/core/lib/browser';
import { FileDownloadCommands } from '@theia/filesystem/lib/browser/download/file-download-command-contribution';
import { CommandRegistry, MenuModelRegistry, MenuPath, isOSX, Command } from '@theia/core/lib/common';
import { SHELL_TABBAR_CONTEXT_MENU } from '@theia/core/lib/browser';
import { WorkspaceCommands, WorkspaceService, WorkspacePreferences } from '@theia/workspace/lib/browser';
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from './navigator-widget';
import { FileNavigatorPreferences } from './navigator-preferences';
import { NavigatorKeybindingContexts } from './navigator-keybinding-context';
import { FileNavigatorFilter } from './navigator-filter';
import { WorkspaceNode } from './navigator-tree';
import { NavigatorContextKeyService } from './navigator-context-key-service';

export namespace FileNavigatorCommands {
    export const REVEAL_IN_NAVIGATOR: Command = {
        id: 'navigator.reveal',
        label: 'Reveal in Files'
    };
    export const TOGGLE_HIDDEN_FILES: Command = {
        id: 'navigator.toggle.hidden.files',
        label: 'Toggle Hidden Files'
    };
    export const COLLAPSE_ALL: Command = {
        id: 'navigator.collapse.all'
    };
}

export const NAVIGATOR_CONTEXT_MENU: MenuPath = ['navigator-context-menu'];

/**
 * Navigator context menu default groups should be aligned
 * with VS Code default groups: https://code.visualstudio.com/api/references/contribution-points#contributes.menus
 */
export namespace NavigatorContextMenu {
    export const NAVIGATION = [...NAVIGATOR_CONTEXT_MENU, 'navigation'];
    /** @deprecated use NAVIGATION */
    export const OPEN = NAVIGATION;
    /** @deprecated use NAVIGATION */
    export const NEW = NAVIGATION;

    export const WORKSPACE = [...NAVIGATOR_CONTEXT_MENU, '2_workspace'];

    export const COMPARE = [...NAVIGATOR_CONTEXT_MENU, '3_compare'];
    /** @deprecated use COMPARE */
    export const DIFF = COMPARE;

    export const SEARCH = [...NAVIGATOR_CONTEXT_MENU, '4_search'];
    export const CLIPBOARD = [...NAVIGATOR_CONTEXT_MENU, '5_cutcopypaste'];

    export const MODIFICATION = [...NAVIGATOR_CONTEXT_MENU, '7_modification'];
    /** @deprecated use MODIFICATION */
    export const MOVE = MODIFICATION;
    /** @deprecated use MODIFICATION */
    export const ACTIONS = MODIFICATION;

    export const OPEN_WITH = [...NAVIGATION, 'open_with'];
}

@injectable()
export class FileNavigatorContribution extends AbstractViewContribution<FileNavigatorWidget> implements FrontendApplicationContribution {

    @inject(NavigatorContextKeyService)
    protected readonly contextKeyService: NavigatorContextKeyService;

    constructor(
        @inject(FileNavigatorPreferences) protected readonly fileNavigatorPreferences: FileNavigatorPreferences,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(FileNavigatorFilter) protected readonly fileNavigatorFilter: FileNavigatorFilter,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(WorkspacePreferences) protected readonly workspacePreferences: WorkspacePreferences
    ) {
        super({
            widgetId: FILE_NAVIGATOR_ID,
            widgetName: 'Explorer',
            defaultWidgetOptions: {
                area: 'left',
                rank: 100
            },
            toggleCommandId: 'fileNavigator:toggle',
            toggleKeybinding: 'ctrlcmd+shift+e'
        });
    }

    @postConstruct()
    protected async init() {
        await this.fileNavigatorPreferences.ready;
        this.shell.currentChanged.connect(() => this.onCurrentWidgetChangedHandler());

        const updateFocusContextKeys = () => {
            const hasFocus = this.shell.activeWidget instanceof FileNavigatorWidget;
            this.contextKeyService.explorerViewletFocus.set(hasFocus);
            this.contextKeyService.filesExplorerFocus.set(hasFocus);
        };
        updateFocusContextKeys();
        this.shell.activeChanged.connect(updateFocusContextKeys);

    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView();
    }

    registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(FileNavigatorCommands.REVEAL_IN_NAVIGATOR, {
            execute: () => this.openView({ activate: true }).then(() => this.selectWidgetFileNode(this.shell.currentWidget)),
            isEnabled: () => Navigatable.is(this.shell.currentWidget),
            isVisible: () => Navigatable.is(this.shell.currentWidget)
        });
        registry.registerCommand(FileNavigatorCommands.TOGGLE_HIDDEN_FILES, {
            execute: () => {
                this.fileNavigatorFilter.toggleHiddenFiles();
            },
            isEnabled: () => true,
            isVisible: () => true
        });
        registry.registerCommand(FileNavigatorCommands.COLLAPSE_ALL, {
            execute: () => this.collapseFileNavigatorTree(),
            isEnabled: () => this.workspaceService.opened,
            isVisible: () => this.workspaceService.opened
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        super.registerMenus(registry);
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: FileNavigatorCommands.REVEAL_IN_NAVIGATOR.id,
            label: 'Reveal in Files',
            order: '5'
        });

        registry.registerMenuAction(NavigatorContextMenu.NAVIGATION, {
            commandId: CommonCommands.OPEN.id
        });
        registry.registerSubmenu(NavigatorContextMenu.OPEN_WITH, 'Open With');
        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = WorkspaceCommands.FILE_OPEN_WITH(opener);
                registry.registerMenuAction(NavigatorContextMenu.OPEN_WITH, {
                    commandId: openWithCommand.id,
                    label: opener.label,
                    icon: opener.iconClass
                });
            }
        });

        // registry.registerMenuAction([CONTEXT_MENU_PATH, CUT_MENU_GROUP], {
        //     commandId: Commands.FILE_CUT
        // });

        registry.registerMenuAction(NavigatorContextMenu.CLIPBOARD, {
            commandId: CommonCommands.COPY.id
        });
        registry.registerMenuAction(NavigatorContextMenu.CLIPBOARD, {
            commandId: CommonCommands.PASTE.id
        });

        registry.registerMenuAction(NavigatorContextMenu.MODIFICATION, {
            commandId: WorkspaceCommands.FILE_RENAME.id
        });
        registry.registerMenuAction(NavigatorContextMenu.MODIFICATION, {
            commandId: WorkspaceCommands.FILE_DELETE.id
        });
        registry.registerMenuAction(NavigatorContextMenu.MODIFICATION, {
            commandId: WorkspaceCommands.FILE_DUPLICATE.id
        });
        registry.registerMenuAction(NavigatorContextMenu.MODIFICATION, {
            commandId: FileDownloadCommands.DOWNLOAD.id,
            label: 'Download',
            order: 'z1' // Should be the last item in the "move" menu group.
        });

        registry.registerMenuAction(NavigatorContextMenu.NAVIGATION, {
            commandId: WorkspaceCommands.NEW_FILE.id
        });
        registry.registerMenuAction(NavigatorContextMenu.NAVIGATION, {
            commandId: WorkspaceCommands.NEW_FOLDER.id
        });
        registry.registerMenuAction(NavigatorContextMenu.COMPARE, {
            commandId: WorkspaceCommands.FILE_COMPARE.id
        });
        registry.registerMenuAction(NavigatorContextMenu.MODIFICATION, {
            commandId: FileNavigatorCommands.COLLAPSE_ALL.id,
            label: 'Collapse All',
            order: 'z2'
        });

        this.workspacePreferences.ready.then(() => {
            if (this.workspacePreferences['workspace.supportMultiRootWorkspace']) {
                this.registerAddRemoveFolderActions(registry);
            }
            this.workspacePreferences.onPreferenceChanged(change => {
                if (change.preferenceName === 'workspace.supportMultiRootWorkspace') {
                    if (change.newValue) {
                        this.registerAddRemoveFolderActions(registry);
                    } else {
                        this.unregisterAddRemoveFolderActions(registry);
                    }
                }
            });
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        super.registerKeybindings(registry);
        registry.registerKeybinding({
            command: FileNavigatorCommands.REVEAL_IN_NAVIGATOR.id,
            keybinding: 'alt+r'
        });

        registry.registerKeybinding({
            command: WorkspaceCommands.FILE_DELETE.id,
            keybinding: 'del',
            context: NavigatorKeybindingContexts.navigatorActive
        });
        if (isOSX) {
            registry.registerKeybinding({
                command: WorkspaceCommands.FILE_DELETE.id,
                keybinding: 'cmd+backspace',
                context: NavigatorKeybindingContexts.navigatorActive
            });
        }

        registry.registerKeybinding({
            command: WorkspaceCommands.FILE_RENAME.id,
            keybinding: 'f2',
            context: NavigatorKeybindingContexts.navigatorActive
        });

        registry.registerKeybinding({
            command: FileNavigatorCommands.TOGGLE_HIDDEN_FILES.id,
            keybinding: 'ctrlcmd+i',
            context: NavigatorKeybindingContexts.navigatorActive
        });
    }

    /**
     * Reveals and selects node in the file navigator to which given widget is related.
     * Does nothing if given widget undefined or doesn't have related resource.
     *
     * @param widget widget file resource of which should be revealed and selected
     */
    async selectWidgetFileNode(widget: Widget | undefined): Promise<void> {
        if (Navigatable.is(widget)) {
            const resourceUri = widget.getResourceUri();
            if (resourceUri) {
                const { model } = await this.widget;
                const node = await model.revealFile(resourceUri);
                if (SelectableTreeNode.is(node)) {
                    model.selectNode(node);
                }
            }
        }
    }

    protected onCurrentWidgetChangedHandler(): void {
        if (this.fileNavigatorPreferences['navigator.autoReveal']) {
            this.selectWidgetFileNode(this.shell.currentWidget);
        }
    }

    /**
     * Collapse file navigator nodes and set focus on first visible node
     * - single root workspace: collapse all nodes except root
     * - multiple root workspace: collapse all nodes, even roots
     */
    async collapseFileNavigatorTree(): Promise<void> {
        const { model } = await this.widget;

        // collapse all child nodes which are not the root (single root workspace)
        // collapse all root nodes (multiple root workspace)
        let root = model.root as CompositeTreeNode;
        if (WorkspaceNode.is(root) && root.children.length === 1) {
            root = root.children[0];
        }
        root.children.forEach(child => CompositeTreeNode.is(child) && model.collapseAll(child));

        // select first visible node
        const firstChild = WorkspaceNode.is(root) ? root.children[0] : root;
        if (SelectableTreeNode.is(firstChild)) {
            await model.selectNode(firstChild);
        }
    }

    private registerAddRemoveFolderActions(registry: MenuModelRegistry): void {
        registry.registerMenuAction(NavigatorContextMenu.WORKSPACE, {
            commandId: WorkspaceCommands.ADD_FOLDER.id
        });
        registry.registerMenuAction(NavigatorContextMenu.WORKSPACE, {
            commandId: WorkspaceCommands.REMOVE_FOLDER.id
        });
    }

    private unregisterAddRemoveFolderActions(registry: MenuModelRegistry): void {
        registry.unregisterMenuAction({ commandId: WorkspaceCommands.ADD_FOLDER.id }, NavigatorContextMenu.WORKSPACE);
        registry.unregisterMenuAction({ commandId: WorkspaceCommands.REMOVE_FOLDER.id }, NavigatorContextMenu.WORKSPACE);
    }
}
