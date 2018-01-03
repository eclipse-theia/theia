/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../common/menu';
import { KeybindingContribution, KeybindingRegistry } from '../common/keybinding';
import { KeyCode, Key, Modifier } from '../common/keys';
import { CommandContribution, CommandRegistry, Command } from '../common/command';
import { MessageService } from '../common/message-service';
import { ApplicationShell } from './shell/application-shell';
import { SHELL_TABBAR_CONTEXT_MENU } from './shell/tab-bars';
import * as browser from './browser';

export namespace CommonMenus {

    export const FILE = [...MAIN_MENU_BAR, '1_file'];
    export const FILE_NEW = [...FILE, '1_new'];
    export const FILE_OPEN = [...FILE, '2_open'];
    export const FILE_SAVE = [...FILE, '3_save'];

    export const EDIT = [...MAIN_MENU_BAR, '2_edit'];
    export const EDIT_UNDO = [...EDIT, '1_undo'];
    export const EDIT_CLIPBOARD = [...EDIT, '2_clipboard'];
    export const EDIT_FIND = [...EDIT, '3_find'];

    export const VIEW = [...MAIN_MENU_BAR, '3_view'];

    export const HELP = [...MAIN_MENU_BAR, "4_help"];

}

export namespace CommonCommands {

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

    export const SAVE: Command = {
        id: 'core.save',
        label: 'Save'
    };
    export const SAVE_ALL: Command = {
        id: 'core.saveAll',
        label: 'Save All'
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
        @inject(MessageService) protected readonly messageService: MessageService
    ) { }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(CommonMenus.FILE, 'File');
        registry.registerSubmenu(CommonMenus.EDIT, 'Edit');
        registry.registerSubmenu(CommonMenus.VIEW, 'View');
        registry.registerSubmenu(CommonMenus.HELP, 'Help');

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

        registry.registerMenuAction(CommonMenus.FILE_SAVE, {
            commandId: CommonCommands.SAVE.id
        });
        registry.registerMenuAction(CommonMenus.FILE_SAVE, {
            commandId: CommonCommands.SAVE_ALL.id
        });
    }

    registerCommands(commandRegistry: CommandRegistry): void {
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
                    this.shell.collapseSidePanel(currentArea);
                }
            }
        });
        commandRegistry.registerCommand(CommonCommands.COLLAPSE_ALL_PANELS, {
            execute: () => {
                this.shell.collapseSidePanel('left');
                this.shell.collapseSidePanel('right');
                this.shell.collapseSidePanel('bottom');
            }
        });

        commandRegistry.registerCommand(CommonCommands.SAVE, {
            execute: () => this.shell.save()
        });
        commandRegistry.registerCommand(CommonCommands.SAVE_ALL, {
            execute: () => this.shell.saveAll()
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        if (supportCut) {
            registry.registerKeybinding({
                commandId: CommonCommands.CUT.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_X, modifiers: [Modifier.M1] })
            });
        }
        if (supportCopy) {
            registry.registerKeybinding({
                commandId: CommonCommands.COPY.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [Modifier.M1] })
            });
        }
        if (supportPaste) {
            registry.registerKeybinding({
                commandId: CommonCommands.PASTE.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_V, modifiers: [Modifier.M1] })
            });
        }
        registry.registerKeybindings(
            {
                commandId: CommonCommands.UNDO.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_Z, modifiers: [Modifier.M1] })
            },
            {
                commandId: CommonCommands.REDO.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_Z, modifiers: [Modifier.M2, Modifier.M1] })
            },
            {
                commandId: CommonCommands.FIND.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_F, modifiers: [Modifier.M1] })
            },
            {
                commandId: CommonCommands.REPLACE.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_F, modifiers: [Modifier.M3, Modifier.M1] })
            },
            {
                commandId: CommonCommands.NEXT_TAB.id,
                keyCode: KeyCode.createKeyCode({ first: Key.TAB, modifiers: [Modifier.M1] })
            },
            {
                commandId: CommonCommands.PREVIOUS_TAB.id,
                keyCode: KeyCode.createKeyCode({ first: Key.TAB, modifiers: [Modifier.M1, Modifier.M2] })
            },
            {
                commandId: CommonCommands.CLOSE_TAB.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_W, modifiers: [Modifier.M3] })
            },
            {
                commandId: CommonCommands.CLOSE_OTHER_TABS.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_T, modifiers: [Modifier.M3, Modifier.M1] })
            },
            {
                commandId: CommonCommands.CLOSE_ALL_TABS.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_W, modifiers: [Modifier.M2, Modifier.M3] })
            },
            {
                commandId: CommonCommands.COLLAPSE_PANEL.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [Modifier.M3] })
            },
            {
                commandId: CommonCommands.COLLAPSE_ALL_PANELS.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [Modifier.M2, Modifier.M3] })
            },
            {
                commandId: CommonCommands.SAVE.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_S, modifiers: [Modifier.M1] })
            },
            {
                commandId: CommonCommands.SAVE_ALL.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_S, modifiers: [Modifier.M3, Modifier.M1] })
            }
        );
    }
}
