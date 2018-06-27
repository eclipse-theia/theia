/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from "inversify";
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../common/menu';
import { KeybindingContribution, KeybindingRegistry } from './keybinding';
import { CommandContribution, CommandRegistry, Command } from '../common/command';
import { UriAwareCommandHandler } from '../common/uri-command-handler';
import { SelectionService } from "../common/selection-service";
import { MessageService } from '../common/message-service';
import { OpenerService, open } from '../browser/opener-service';
import { ApplicationShell } from './shell/application-shell';
import { SHELL_TABBAR_CONTEXT_MENU } from './shell/tab-bars';
import { AboutDialog } from './about-dialog';
import * as browser from './browser';
import URI from '../common/uri';

export namespace CommonMenus {

    export const FILE = [...MAIN_MENU_BAR, '1_file'];
    export const FILE_NEW = [...FILE, '1_new'];
    export const FILE_OPEN = [...FILE, '2_open'];
    export const FILE_SAVE = [...FILE, '3_save'];
    export const FILE_AUTOSAVE = [...FILE, '4_autosave'];
    export const FILE_CLOSE = [...FILE, '5_close'];

    export const EDIT = [...MAIN_MENU_BAR, '2_edit'];
    export const EDIT_UNDO = [...EDIT, '1_undo'];
    export const EDIT_CLIPBOARD = [...EDIT, '2_clipboard'];
    export const EDIT_FIND = [...EDIT, '3_find'];

    export const VIEW = [...MAIN_MENU_BAR, '3_view'];
    export const VIEW_VIEWS = [...VIEW, '1_views'];
    export const VIEW_LAYOUT = [...VIEW, '2_layout'];

    export const HELP = [...MAIN_MENU_BAR, "4_help"];

}

export namespace CommonCommands {

    export const OPEN: Command = {
        id: 'core.open',
        label: 'Open'
    };

    export const CUT: Command = {
        id: 'core.cut',
        label: 'Cut'
    };
    export const COPY: Command = {
        id: 'core.copy',
        label: 'Copy'
    };
    export const PASTE: Command = {
        id: 'core.paste',
        label: 'Paste'
    };

    export const UNDO: Command = {
        id: 'core.undo',
        label: 'Undo'
    };
    export const REDO: Command = {
        id: 'core.redo',
        label: 'Redo'
    };

    export const FIND: Command = {
        id: 'core.find',
        label: 'Find'
    };
    export const REPLACE: Command = {
        id: 'core.replace',
        label: 'Replace'
    };

    export const NEXT_TAB: Command = {
        id: 'core.nextTab',
        label: 'Switch to Next Tab'
    };
    export const PREVIOUS_TAB: Command = {
        id: 'core.previousTab',
        label: 'Switch to Previous Tab'
    };
    export const CLOSE_TAB: Command = {
        id: 'core.close.tab',
        label: 'Close Tab'
    };
    export const CLOSE_OTHER_TABS: Command = {
        id: 'core.close.other.tabs',
        label: 'Close Other Tabs'
    };
    export const CLOSE_RIGHT_TABS: Command = {
        id: 'core.close.right.tabs',
        label: 'Close Tabs to the Right'
    };
    export const CLOSE_ALL_TABS: Command = {
        id: 'core.close.all.tabs',
        label: 'Close All Tabs'
    };
    export const COLLAPSE_PANEL: Command = {
        id: 'core.collapse.tab',
        label: 'Collapse Side Panel'
    };
    export const COLLAPSE_ALL_PANELS: Command = {
        id: 'core.collapse.all.tabs',
        label: 'Collapse All Side Panels'
    };
    export const TOGGLE_BOTTOM_PANEL: Command = {
        id: 'core.toggle.bottom.panel',
        label: 'Toggle Bottom Panel'
    };

    export const SAVE: Command = {
        id: 'core.save',
        label: 'Save'
    };
    export const SAVE_ALL: Command = {
        id: 'core.saveAll',
        label: 'Save All'
    };

    export const AUTO_SAVE: Command = {
        id: 'textEditor.commands.autosave',
        label: 'Auto Save'
    };

    export const QUIT: Command = {
        id: 'core.quit',
        label: 'Quit'
    };

    export const ABOUT_COMMAND: Command = {
        id: 'core.about',
        label: 'About'
    };

}

export const supportCut = browser.isNative || document.queryCommandSupported('cut');
export const supportCopy = browser.isNative || document.queryCommandSupported('copy');
// Chrome incorrectly returns true for document.queryCommandSupported('paste')
// when the paste feature is available but the calling script has insufficient
// privileges to actually perform the action
export const supportPaste = browser.isNative || (!browser.isChrome && document.queryCommandSupported('paste'));

@injectable()
export class CommonFrontendContribution implements MenuContribution, CommandContribution, KeybindingContribution {

    constructor(
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(AboutDialog) protected readonly aboutDialog: AboutDialog
    ) { }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(CommonMenus.FILE, 'File');
        registry.registerSubmenu(CommonMenus.EDIT, 'Edit');
        registry.registerSubmenu(CommonMenus.VIEW, 'View');
        registry.registerSubmenu(CommonMenus.HELP, 'Help');

        registry.registerMenuAction(CommonMenus.FILE_SAVE, {
            commandId: CommonCommands.SAVE.id
        });
        registry.registerMenuAction(CommonMenus.FILE_SAVE, {
            commandId: CommonCommands.SAVE_ALL.id
        });

        registry.registerMenuAction(CommonMenus.FILE_AUTOSAVE, {
            commandId: CommonCommands.AUTO_SAVE.id
        });

        registry.registerMenuAction(CommonMenus.EDIT_UNDO, {
            commandId: CommonCommands.UNDO.id,
            order: '0'
        });
        registry.registerMenuAction(CommonMenus.EDIT_UNDO, {
            commandId: CommonCommands.REDO.id,
            order: '1'
        });

        registry.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: CommonCommands.FIND.id,
            order: '0'
        });
        registry.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: CommonCommands.REPLACE.id,
            order: '1'
        });

        registry.registerMenuAction(CommonMenus.EDIT_CLIPBOARD, {
            commandId: CommonCommands.CUT.id,
            order: '0'
        });
        registry.registerMenuAction(CommonMenus.EDIT_CLIPBOARD, {
            commandId: CommonCommands.COPY.id,
            order: '1'
        });
        registry.registerMenuAction(CommonMenus.EDIT_CLIPBOARD, {
            commandId: CommonCommands.PASTE.id,
            order: '2'
        });

        registry.registerMenuAction(CommonMenus.VIEW_LAYOUT, {
            commandId: CommonCommands.TOGGLE_BOTTOM_PANEL.id,
            order: '0'
        });
        registry.registerMenuAction(CommonMenus.VIEW_LAYOUT, {
            commandId: CommonCommands.COLLAPSE_ALL_PANELS.id,
            order: '1'
        });

        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: CommonCommands.CLOSE_TAB.id,
            label: 'Close',
            order: '0'
        });
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: CommonCommands.CLOSE_OTHER_TABS.id,
            label: 'Close Others',
            order: '1'
        });
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: CommonCommands.CLOSE_RIGHT_TABS.id,
            label: 'Close to the Right',
            order: '2'
        });
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: CommonCommands.CLOSE_ALL_TABS.id,
            label: 'Close All',
            order: '3'
        });
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: CommonCommands.COLLAPSE_PANEL.id,
            label: 'Collapse',
            order: '4'
        });
        registry.registerMenuAction(CommonMenus.HELP, {
            commandId: CommonCommands.ABOUT_COMMAND.id,
            label: 'About',
            order: '9'
        });
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(CommonCommands.OPEN, new UriAwareCommandHandler<URI>(this.selectionService, {
            execute: uri => open(this.openerService, uri)
        }));
        commandRegistry.registerCommand(CommonCommands.CUT, {
            execute: () => {
                if (supportCut) {
                    document.execCommand('cut');
                } else {
                    this.messageService.warn("Please use the browser's cut command or shortcut.");
                }
            }
        });
        commandRegistry.registerCommand(CommonCommands.COPY, {
            execute: () => {
                if (supportCopy) {
                    document.execCommand('copy');
                } else {
                    this.messageService.warn("Please use the browser's copy command or shortcut.");
                }
            }
        });
        commandRegistry.registerCommand(CommonCommands.PASTE, {
            execute: () => {
                if (supportPaste) {
                    document.execCommand('paste');
                } else {
                    this.messageService.warn("Please use the browser's paste command or shortcut.");
                }
            }
        });

        commandRegistry.registerCommand(CommonCommands.UNDO);
        commandRegistry.registerCommand(CommonCommands.REDO);

        commandRegistry.registerCommand(CommonCommands.FIND);
        commandRegistry.registerCommand(CommonCommands.REPLACE);

        commandRegistry.registerCommand(CommonCommands.NEXT_TAB, {
            isEnabled: () => this.shell.currentTabBar !== undefined,
            execute: () => this.shell.activateNextTab()
        });
        commandRegistry.registerCommand(CommonCommands.PREVIOUS_TAB, {
            isEnabled: () => this.shell.currentTabBar !== undefined,
            execute: () => this.shell.activatePreviousTab()
        });
        commandRegistry.registerCommand(CommonCommands.CLOSE_TAB, {
            isEnabled: () => this.shell.currentTabBar !== undefined,
            execute: () => {
                const tabBar = this.shell.currentTabBar!;
                const currentTitle = tabBar.currentTitle;
                this.shell.closeTabs(tabBar, (title, index) => title === currentTitle);
            }
        });
        commandRegistry.registerCommand(CommonCommands.CLOSE_OTHER_TABS, {
            isEnabled: () => {
                const tabBar = this.shell.currentTabBar;
                if (tabBar) {
                    return tabBar.titles.length > 1;
                }
                return false;
            },
            execute: () => {
                const tabBar = this.shell.currentTabBar!;
                const currentTitle = tabBar.currentTitle;
                this.shell.closeTabs(this.shell.currentTabArea!, (title, index) => title !== currentTitle);
            }
        });
        commandRegistry.registerCommand(CommonCommands.CLOSE_RIGHT_TABS, {
            isEnabled: () => {
                const tabBar = this.shell.currentTabBar;
                if (tabBar) {
                    return tabBar.currentIndex < tabBar.titles.length - 1;
                }
                return false;
            },
            isVisible: () => {
                const area = this.shell.currentTabArea;
                return area !== 'left' && area !== 'right';
            },
            execute: () => {
                const tabBar = this.shell.currentTabBar!;
                const currentIndex = tabBar.currentIndex;
                this.shell.closeTabs(tabBar, (title, index) => index > currentIndex);
            }
        });
        commandRegistry.registerCommand(CommonCommands.CLOSE_ALL_TABS, {
            isEnabled: () => this.shell.currentTabBar !== undefined,
            execute: () => this.shell.closeTabs(this.shell.currentTabArea!)
        });
        commandRegistry.registerCommand(CommonCommands.COLLAPSE_PANEL, {
            isEnabled: () => ApplicationShell.isSideArea(this.shell.currentTabArea),
            isVisible: () => ApplicationShell.isSideArea(this.shell.currentTabArea),
            execute: () => {
                const currentArea = this.shell.currentTabArea;
                if (ApplicationShell.isSideArea(currentArea)) {
                    this.shell.collapsePanel(currentArea);
                }
            }
        });
        commandRegistry.registerCommand(CommonCommands.COLLAPSE_ALL_PANELS, {
            execute: () => {
                this.shell.collapsePanel('left');
                this.shell.collapsePanel('right');
                this.shell.collapsePanel('bottom');
            }
        });
        commandRegistry.registerCommand(CommonCommands.TOGGLE_BOTTOM_PANEL, {
            isEnabled: () => this.shell.getWidgets('bottom').length > 0,
            execute: () => {
                if (this.shell.isExpanded('bottom')) {
                    this.shell.collapsePanel('bottom');
                } else {
                    this.shell.expandPanel('bottom');
                }
            }
        });

        commandRegistry.registerCommand(CommonCommands.SAVE, {
            execute: () => this.shell.save()
        });
        commandRegistry.registerCommand(CommonCommands.SAVE_ALL, {
            execute: () => this.shell.saveAll()
        });

        commandRegistry.registerCommand(CommonCommands.QUIT, {
            execute: () => {
                /* FIXME implement QUIT of innermost command.  */
            }
        });
        commandRegistry.registerCommand(CommonCommands.ABOUT_COMMAND, {
            execute: () => this.openAbout()
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        if (supportCut) {
            registry.registerKeybinding({
                command: CommonCommands.CUT.id,
                keybinding: "ctrlcmd+x"
            });
        }
        if (supportCopy) {
            registry.registerKeybinding({
                command: CommonCommands.COPY.id,
                keybinding: "ctrlcmd+c"
            });
        }
        if (supportPaste) {
            registry.registerKeybinding({
                command: CommonCommands.PASTE.id,
                keybinding: "ctrlcmd+v"
            });
        }
        registry.registerKeybindings(
            {
                command: CommonCommands.UNDO.id,
                keybinding: "ctrlcmd+z"
            },
            {
                command: CommonCommands.REDO.id,
                keybinding: "ctrlcmd+shift+z"
            },
            {
                command: CommonCommands.FIND.id,
                keybinding: "ctrlcmd+f"
            },
            {
                command: CommonCommands.REPLACE.id,
                keybinding: "ctrlcmd+alt+f"
            },
            {
                command: CommonCommands.NEXT_TAB.id,
                keybinding: "ctrlcmd+tab"
            },
            {
                command: CommonCommands.PREVIOUS_TAB.id,
                keybinding: "ctrlcmd+shift+tab"
            },
            {
                command: CommonCommands.CLOSE_TAB.id,
                keybinding: "alt+w"
            },
            {
                command: CommonCommands.CLOSE_OTHER_TABS.id,
                keybinding: "ctrlcmd+alt+t"
            },
            {
                command: CommonCommands.CLOSE_ALL_TABS.id,
                keybinding: "alt+shift+w"
            },
            {
                command: CommonCommands.COLLAPSE_PANEL.id,
                keybinding: "alt+c"
            },
            {
                command: CommonCommands.TOGGLE_BOTTOM_PANEL.id,
                keybinding: "ctrlcmd+j",
            },
            {
                command: CommonCommands.COLLAPSE_ALL_PANELS.id,
                keybinding: "alt+shift+c",
            },
            {
                command: CommonCommands.SAVE.id,
                keybinding: "ctrlcmd+s"
            },
            {
                command: CommonCommands.SAVE_ALL.id,
                keybinding: "ctrlcmd+alt+s"
            },
            {
                command: CommonCommands.QUIT.id,
                keybinding: "ctrlcmd+q"
            }
        );
    }

    protected async openAbout() {
        this.aboutDialog.open();
    }
}
