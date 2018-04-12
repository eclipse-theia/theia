/*
 * Copyright (C) 2017-2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from 'inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { CommandRegistry, MenuModelRegistry, MenuPath, isOSX } from '@theia/core/lib/common';
import { Navigatable, SelectableTreeNode, KeybindingRegistry, CommonCommands, OpenerService, Widget, WidgetManager } from '@theia/core/lib/browser';
import { SHELL_TABBAR_CONTEXT_MENU } from '@theia/core/lib/browser';
import { WorkspaceCommands, WorkspaceService } from '@theia/workspace/lib/browser';
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from './navigator-widget';
import { FileNavigatorPreferences } from './navigator-preferences';
import { NavigatorKeybindingContexts } from './navigator-keybinding-context';
import { FileNavigatorFilter } from "./navigator-filter";
import { FileStatNode } from '@theia/filesystem/lib/browser';
import URI from '@theia/core/lib/common/uri';

export namespace FileNavigatorCommands {
    export const REVEAL_IN_NAVIGATOR = {
        id: 'navigator.reveal',
        label: 'Reveal in Files'
    };
    export const TOGGLE_HIDDEN_FILES = {
        id: 'navigator.toggle.hidden.files',
        label: 'Toggle Hidden Files'
    };
}

export const NAVIGATOR_CONTEXT_MENU: MenuPath = ['navigator-context-menu'];

export namespace NavigatorContextMenu {
    export const OPEN = [...NAVIGATOR_CONTEXT_MENU, '1_open'];
    export const OPEN_WITH = [...OPEN, 'open_with'];
    export const CLIPBOARD = [...NAVIGATOR_CONTEXT_MENU, '2_clipboard'];
    export const MOVE = [...NAVIGATOR_CONTEXT_MENU, '3_move'];
    export const NEW = [...NAVIGATOR_CONTEXT_MENU, '4_new'];
    export const DIFF = [...NAVIGATOR_CONTEXT_MENU, '5_diff'];
    export const WORKSPACE = [...NAVIGATOR_CONTEXT_MENU, '6_workspace'];
}

@injectable()
export class FileNavigatorContribution extends AbstractViewContribution<FileNavigatorWidget>  {

    constructor(
        @inject(FileNavigatorPreferences) protected readonly fileNavigatorPreferences: FileNavigatorPreferences,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(FileNavigatorFilter) protected readonly fileNavigatorFilter: FileNavigatorFilter,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager
    ) {
        super({
            widgetId: FILE_NAVIGATOR_ID,
            widgetName: 'Files',
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
        registry.registerCommand(WorkspaceCommands.REMOVE_FOLDER, {
            execute: () => this.removeFolderFromWorkspace(),
            isEnabled: () => this.workspaceService.opened,
            isVisible: () => this.isRootFolderSelected()
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        super.registerMenus(registry);
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: FileNavigatorCommands.REVEAL_IN_NAVIGATOR.id,
            label: 'Reveal in Files',
            order: '5'
        });

        registry.registerMenuAction(NavigatorContextMenu.OPEN, {
            commandId: CommonCommands.OPEN.id
        });
        registry.registerSubmenu(NavigatorContextMenu.OPEN_WITH, 'Open With');
        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = WorkspaceCommands.FILE_OPEN_WITH(opener);
                registry.registerMenuAction(NavigatorContextMenu.OPEN_WITH, {
                    commandId: openWithCommand.id
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

        registry.registerMenuAction(NavigatorContextMenu.MOVE, {
            commandId: WorkspaceCommands.FILE_RENAME.id
        });
        registry.registerMenuAction(NavigatorContextMenu.MOVE, {
            commandId: WorkspaceCommands.FILE_DELETE.id
        });

        registry.registerMenuAction(NavigatorContextMenu.NEW, {
            commandId: WorkspaceCommands.NEW_FILE.id
        });
        registry.registerMenuAction(NavigatorContextMenu.NEW, {
            commandId: WorkspaceCommands.NEW_FOLDER.id
        });
        registry.registerMenuAction(NavigatorContextMenu.DIFF, {
            commandId: WorkspaceCommands.FILE_COMPARE.id
        });

        registry.registerMenuAction(NavigatorContextMenu.WORKSPACE, {
            commandId: WorkspaceCommands.ADD_FOLDER.id
        });
        registry.registerMenuAction(NavigatorContextMenu.WORKSPACE, {
            commandId: WorkspaceCommands.REMOVE_FOLDER.id,
            label: 'Remove Folder from Workspace'
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        super.registerKeybindings(registry);
        registry.registerKeybinding({
            command: FileNavigatorCommands.REVEAL_IN_NAVIGATOR.id,
            keybinding: "alt+r"
        });

        registry.registerKeybinding({
            command: WorkspaceCommands.FILE_DELETE.id,
            keybinding: "del",
            context: NavigatorKeybindingContexts.navigatorActive
        });
        if (isOSX) {
            registry.registerKeybinding({
                command: WorkspaceCommands.FILE_DELETE.id,
                keybinding: "cmd+backspace",
                context: NavigatorKeybindingContexts.navigatorActive
            });
        }

        registry.registerKeybinding({
            command: WorkspaceCommands.FILE_RENAME.id,
            keybinding: "f2",
            context: NavigatorKeybindingContexts.navigatorActive
        });

        registry.registerKeybinding({
            command: FileNavigatorCommands.TOGGLE_HIDDEN_FILES.id,
            keybinding: "ctrlcmd+i",
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
            const fileUri = widget.getTargetUri();
            if (fileUri) {
                const { model } = await this.widget;
                const node = await model.revealFile(fileUri);
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

    protected removeFolderFromWorkspace() {
        this.workspaceService.removeFolders(
            this.getSelectedNodesInFileNavigator()
                .filter(node => this.isRootDirectory(node))
                .map(rootFolder => {
                    const rootFolderNode = rootFolder as FileStatNode;
                    return new URI(rootFolderNode.uri.toString());
                })
        );
    }

    private isRootFolderSelected(): boolean {
        return this.getSelectedNodesInFileNavigator().some(node => this.isRootDirectory(node));
    }

    private getSelectedNodesInFileNavigator(): Readonly<SelectableTreeNode>[] {
        return this.widgetManager.getWidgets(FILE_NAVIGATOR_ID)
            .map(widget => widget as FileNavigatorWidget)
            .map(fileNavigatorWidget => fileNavigatorWidget.model.selectedNodes as Array<Readonly<SelectableTreeNode>>)
            .reduce((prev, cur) => [...prev, ...cur]);
    }

    private isRootDirectory(node: Readonly<SelectableTreeNode>): boolean {
        return node && node.parent !== undefined
            && node.parent.parent === undefined
            && !node.parent.visible
            && node.parent.name === 'WorkspaceRoot';
    }
}
