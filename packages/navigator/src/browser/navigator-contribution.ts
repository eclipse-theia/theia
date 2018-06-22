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

import { injectable, inject, postConstruct } from "inversify";
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { CommandRegistry, MenuModelRegistry, MenuPath, isOSX } from "@theia/core/lib/common";
import { Navigatable, SelectableTreeNode, Widget, KeybindingRegistry, CommonCommands,
         OpenerService, FrontendApplicationContribution, FrontendApplication } from "@theia/core/lib/browser";
import { SHELL_TABBAR_CONTEXT_MENU } from "@theia/core/lib/browser";
import { FileDownloadCommands } from "@theia/filesystem/lib/browser/download/file-download-command-contribution";
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from './navigator-widget';
import { FileNavigatorPreferences } from "./navigator-preferences";
import { NavigatorKeybindingContexts } from './navigator-keybinding-context';
import { FileNavigatorFilter } from "./navigator-filter";

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
}

@injectable()
export class FileNavigatorContribution extends AbstractViewContribution<FileNavigatorWidget> implements FrontendApplicationContribution {

    constructor(
        @inject(FileNavigatorPreferences) protected readonly fileNavigatorPreferences: FileNavigatorPreferences,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(FileNavigatorFilter) protected readonly fileNavigatorFilter: FileNavigatorFilter
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
        registry.registerMenuAction(NavigatorContextMenu.MOVE, {
            commandId: FileDownloadCommands.DOWNLOAD.id,
            label: 'Download',
            order: 'z' // Should be the last item in the "move" menu group.
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
}
