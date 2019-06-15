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

import { injectable, inject, postConstruct } from 'inversify';
import { TabBar, Widget, Title } from '@phosphor/widgets';
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../common/menu';
import { KeybindingContribution, KeybindingRegistry } from './keybinding';
import { FrontendApplicationContribution } from './frontend-application';
import { CommandContribution, CommandRegistry, Command } from '../common/command';
import { UriAwareCommandHandler } from '../common/uri-command-handler';
import { SelectionService } from '../common/selection-service';
import { MessageService } from '../common/message-service';
import { OpenerService, open } from '../browser/opener-service';
import { ApplicationShell } from './shell/application-shell';
import { SHELL_TABBAR_CONTEXT_MENU } from './shell/tab-bars';
import { AboutDialog } from './about-dialog';
import * as browser from './browser';
import URI from '../common/uri';
import { ContextKeyService } from './context-key-service';
import { OS, isOSX } from '../common/os';
import { ResourceContextKey } from './resource-context-key';
import { UriSelection } from '../common/selection';
import { StorageService } from './storage-service';
import { Navigatable } from './navigatable';

export namespace CommonMenus {

    export const FILE = [...MAIN_MENU_BAR, '1_file'];
    export const FILE_NEW = [...FILE, '1_new'];
    export const FILE_OPEN = [...FILE, '2_open'];
    export const FILE_SAVE = [...FILE, '3_save'];
    export const FILE_AUTOSAVE = [...FILE, '4_autosave'];
    export const FILE_SETTINGS = [...FILE, '5_settings'];
    export const FILE_SETTINGS_SUBMENU = [...FILE_SETTINGS, '1_settings_submenu'];
    export const FILE_SETTINGS_SUBMENU_OPEN = [...FILE_SETTINGS_SUBMENU, '1_settings_submenu_open'];
    export const FILE_SETTINGS_SUBMENU_THEME = [...FILE_SETTINGS_SUBMENU, '2_settings_submenu_theme'];
    export const FILE_CLOSE = [...FILE, '6_close'];

    export const EDIT = [...MAIN_MENU_BAR, '2_edit'];
    export const EDIT_UNDO = [...EDIT, '1_undo'];
    export const EDIT_CLIPBOARD = [...EDIT, '2_clipboard'];
    export const EDIT_FIND = [...EDIT, '3_find'];

    export const VIEW = [...MAIN_MENU_BAR, '4_view'];
    export const VIEW_PRIMARY = [...VIEW, '0_primary'];
    export const VIEW_VIEWS = [...VIEW, '1_views'];
    export const VIEW_LAYOUT = [...VIEW, '2_layout'];

    // last menu item
    export const HELP = [...MAIN_MENU_BAR, '9_help'];

}

export namespace CommonCommands {

    const FILE_CATEGORY = 'File';
    const VIEW_CATEGORY = 'View';

    export const OPEN: Command = {
        id: 'core.open',
        category: FILE_CATEGORY,
        label: 'Open',
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
        category: VIEW_CATEGORY,
        label: 'Switch to Next Tab'
    };
    export const PREVIOUS_TAB: Command = {
        id: 'core.previousTab',
        category: VIEW_CATEGORY,
        label: 'Switch to Previous Tab'
    };
    export const CLOSE_TAB: Command = {
        id: 'core.close.tab',
        category: VIEW_CATEGORY,
        label: 'Close Tab'
    };
    export const CLOSE_OTHER_TABS: Command = {
        id: 'core.close.other.tabs',
        category: VIEW_CATEGORY,
        label: 'Close Other Tabs'
    };
    export const CLOSE_RIGHT_TABS: Command = {
        id: 'core.close.right.tabs',
        category: VIEW_CATEGORY,
        label: 'Close Tabs to the Right'
    };
    export const CLOSE_ALL_TABS: Command = {
        id: 'core.close.all.tabs',
        category: VIEW_CATEGORY,
        label: 'Close All Tabs'
    };
    export const COLLAPSE_PANEL: Command = {
        id: 'core.collapse.tab',
        category: VIEW_CATEGORY,
        label: 'Collapse Side Panel'
    };
    export const COLLAPSE_ALL_PANELS: Command = {
        id: 'core.collapse.all.tabs',
        category: VIEW_CATEGORY,
        label: 'Collapse All Side Panels'
    };
    export const TOGGLE_BOTTOM_PANEL: Command = {
        id: 'core.toggle.bottom.panel',
        category: VIEW_CATEGORY,
        label: 'Toggle Bottom Panel'
    };
    export const TOGGLE_MAXIMIZED: Command = {
        id: 'core.toggleMaximized',
        category: VIEW_CATEGORY,
        label: 'Toggle Maximized'
    };

    export const SAVE: Command = {
        id: 'core.save',
        category: FILE_CATEGORY,
        label: 'Save',
    };
    export const SAVE_ALL: Command = {
        id: 'core.saveAll',
        category: FILE_CATEGORY,
        label: 'Save All',
    };

    export const AUTO_SAVE: Command = {
        id: 'textEditor.commands.autosave',
        category: FILE_CATEGORY,
        label: 'Auto Save',
    };

    export const QUIT: Command = {
        id: 'core.quit',
        label: 'Quit'
    };

    export const ABOUT_COMMAND: Command = {
        id: 'core.about',
        label: 'About'
    };

    export const OPEN_PREFERENCES: Command = {
        id: 'preferences:open',
        category: 'Settings',
        label: 'Open Preferences',
    };

}

export const supportCut = browser.isNative || document.queryCommandSupported('cut');
export const supportCopy = browser.isNative || document.queryCommandSupported('copy');
// Chrome incorrectly returns true for document.queryCommandSupported('paste')
// when the paste feature is available but the calling script has insufficient
// privileges to actually perform the action
export const supportPaste = browser.isNative || (!browser.isChrome && document.queryCommandSupported('paste'));

export const RECENT_COMMANDS_STORAGE_KEY = 'commands';

@injectable()
export class CommonFrontendContribution implements FrontendApplicationContribution, MenuContribution, CommandContribution, KeybindingContribution {

    constructor(
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(AboutDialog) protected readonly aboutDialog: AboutDialog
    ) { }

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(ResourceContextKey)
    protected readonly resourceContextKey: ResourceContextKey;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    @postConstruct()
    protected init(): void {
        this.contextKeyService.createKey<boolean>('isLinux', OS.type() === OS.Type.Linux);
        this.contextKeyService.createKey<boolean>('isMac', OS.type() === OS.Type.OSX);
        this.contextKeyService.createKey<boolean>('isWindows', OS.type() === OS.Type.Windows);

        this.initResourceContextKeys();
        this.registerCtrlWHandling();
    }

    onStart() {
        this.storageService.getData<{ recent: Command[] }>(RECENT_COMMANDS_STORAGE_KEY, { recent: [] })
            .then(tasks => this.commandRegistry.recent = tasks.recent);
    }

    onStop() {
        const recent = this.commandRegistry.recent;
        this.storageService.setData<{ recent: Command[] }>(RECENT_COMMANDS_STORAGE_KEY, { recent });
    }

    protected initResourceContextKeys(): void {
        const updateContextKeys = () => {
            const selection = this.selectionService.selection;
            const resourceUri = Navigatable.is(selection) && selection.getResourceUri() || UriSelection.getUri(selection);
            this.resourceContextKey.set(resourceUri);
        };
        updateContextKeys();
        this.selectionService.onSelectionChanged(updateContextKeys);
    }

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

        registry.registerSubmenu(CommonMenus.FILE_SETTINGS_SUBMENU, 'Settings');

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
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_MENU, {
            commandId: CommonCommands.TOGGLE_MAXIMIZED.id,
            label: 'Toggle Maximized',
            order: '5'
        });
        registry.registerMenuAction(CommonMenus.HELP, {
            commandId: CommonCommands.ABOUT_COMMAND.id,
            label: 'About',
            order: '9'
        });
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(CommonCommands.OPEN, new UriAwareCommandHandler<URI[]>(this.selectionService, {
            execute: uris => uris.map(uri => open(this.openerService, uri)),
        }, { multi: true }));
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
            isEnabled: (event?: Event) => this.findTabBar(event) !== undefined,
            execute: (event?: Event) => {
                const tabBar = this.findTabBar(event)!;
                const currentTitle = this.findTitle(tabBar, event);
                this.shell.closeTabs(tabBar, (title, index) => title === currentTitle);
            }
        });
        commandRegistry.registerCommand(CommonCommands.CLOSE_OTHER_TABS, {
            isEnabled: (event?: Event) => {
                const tabBar = this.findTabBar(event);
                return tabBar !== undefined && tabBar.titles.length > 1;
            },
            execute: (event?: Event) => {
                const tabBar = this.findTabBar(event)!;
                const currentTitle = this.findTitle(tabBar, event);
                const area = this.shell.getAreaFor(tabBar)!;
                this.shell.closeTabs(area, (title, index) => title !== currentTitle);
            }
        });
        commandRegistry.registerCommand(CommonCommands.CLOSE_RIGHT_TABS, {
            isEnabled: (event?: Event) => {
                const tabBar = this.findTabBar(event);
                return tabBar !== undefined && tabBar.currentIndex < tabBar.titles.length - 1;
            },
            isVisible: (event?: Event) => {
                const area = this.findTabArea(event);
                return area !== undefined && area !== 'left' && area !== 'right';
            },
            execute: (event?: Event) => {
                const tabBar = this.findTabBar(event)!;
                const currentIndex = tabBar.currentIndex;
                this.shell.closeTabs(tabBar, (title, index) => index > currentIndex);
            }
        });
        commandRegistry.registerCommand(CommonCommands.CLOSE_ALL_TABS, {
            isEnabled: (event?: Event) => {
                if (event) {
                    return this.findTabBar(event) !== undefined;
                } else {
                    return this.shell.mainAreaTabBars.find(tb => tb.titles.length > 0) !== undefined;
                }
            },
            execute: (event?: Event) => {
                if (event) {
                    this.shell.closeTabs(this.findTabArea(event)!);
                } else {
                    this.shell.closeTabs('main');
                }
            }
        });
        commandRegistry.registerCommand(CommonCommands.COLLAPSE_PANEL, {
            isEnabled: (event?: Event) => ApplicationShell.isSideArea(this.findTabArea(event)),
            isVisible: (event?: Event) => ApplicationShell.isSideArea(this.findTabArea(event)),
            execute: (event?: Event) => {
                this.shell.collapsePanel(this.findTabArea(event)!);
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
        commandRegistry.registerCommand(CommonCommands.TOGGLE_MAXIMIZED, {
            isEnabled: () => this.shell.canToggleMaximized(),
            isVisible: () => this.shell.canToggleMaximized(),
            execute: () => this.shell.toggleMaximized()
        });

        commandRegistry.registerCommand(CommonCommands.SAVE, {
            execute: () => this.shell.save()
        });
        commandRegistry.registerCommand(CommonCommands.SAVE_ALL, {
            execute: () => this.shell.saveAll()
        });
        commandRegistry.registerCommand(CommonCommands.ABOUT_COMMAND, {
            execute: () => this.openAbout()
        });
    }

    private findTabBar(event?: Event): TabBar<Widget> | undefined {
        if (event && event.target) {
            const tabBar = this.shell.findWidgetForElement(event.target as HTMLElement);
            if (tabBar instanceof TabBar) {
                return tabBar;
            }
        }
        return this.shell.currentTabBar;
    }

    private findTabArea(event?: Event): ApplicationShell.Area | undefined {
        const tabBar = this.findTabBar(event);
        if (tabBar) {
            return this.shell.getAreaFor(tabBar);
        }
        return this.shell.currentTabArea;
    }

    private findTitle(tabBar: TabBar<Widget>, event?: Event): Title<Widget> | undefined {
        if (event && event.target) {
            let tabNode: HTMLElement | null = event.target as HTMLElement;
            while (tabNode && !tabNode.classList.contains('p-TabBar-tab')) {
                tabNode = tabNode.parentElement;
            }
            if (tabNode && tabNode.title) {
                const title = tabBar.titles.find(t => t.label === tabNode!.title);
                if (title) {
                    return title;
                }
            }
        }
        return tabBar.currentTitle || undefined;
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        if (supportCut) {
            registry.registerKeybinding({
                command: CommonCommands.CUT.id,
                keybinding: 'ctrlcmd+x'
            });
        }
        if (supportCopy) {
            registry.registerKeybinding({
                command: CommonCommands.COPY.id,
                keybinding: 'ctrlcmd+c'
            });
        }
        if (supportPaste) {
            registry.registerKeybinding({
                command: CommonCommands.PASTE.id,
                keybinding: 'ctrlcmd+v'
            });
        }
        registry.registerKeybindings(
            // Edition
            {
                command: CommonCommands.UNDO.id,
                keybinding: 'ctrlcmd+z'
            },
            {
                command: CommonCommands.REDO.id,
                keybinding: 'ctrlcmd+shift+z'
            },
            {
                command: CommonCommands.FIND.id,
                keybinding: 'ctrlcmd+f'
            },
            {
                command: CommonCommands.REPLACE.id,
                keybinding: 'ctrlcmd+alt+f'
            },
            // Tabs
            {
                command: CommonCommands.NEXT_TAB.id,
                keybinding: 'ctrlcmd+tab'
            },
            {
                command: CommonCommands.NEXT_TAB.id,
                keybinding: 'ctrlcmd+alt+d'
            },
            {
                command: CommonCommands.PREVIOUS_TAB.id,
                keybinding: 'ctrlcmd+shift+tab'
            },
            {
                command: CommonCommands.PREVIOUS_TAB.id,
                keybinding: 'ctrlcmd+alt+a'
            },
            {
                command: CommonCommands.CLOSE_TAB.id,
                keybinding: 'alt+w'
            },
            {
                command: CommonCommands.CLOSE_OTHER_TABS.id,
                keybinding: 'ctrlcmd+alt+t'
            },
            {
                command: CommonCommands.CLOSE_ALL_TABS.id,
                keybinding: 'alt+shift+w'
            },
            // Panels
            {
                command: CommonCommands.COLLAPSE_PANEL.id,
                keybinding: 'alt+c'
            },
            {
                command: CommonCommands.TOGGLE_BOTTOM_PANEL.id,
                keybinding: 'ctrlcmd+j',
            },
            {
                command: CommonCommands.COLLAPSE_ALL_PANELS.id,
                keybinding: 'alt+shift+c',
            },
            {
                command: CommonCommands.TOGGLE_MAXIMIZED.id,
                keybinding: 'ctrl+m',
            },
            // Saving
            {
                command: CommonCommands.SAVE.id,
                keybinding: 'ctrlcmd+s'
            },
            {
                command: CommonCommands.SAVE_ALL.id,
                keybinding: 'ctrlcmd+alt+s'
            }
        );
    }

    protected async openAbout() {
        this.aboutDialog.open();
    }

    protected shouldPreventClose = false;

    /**
     * registers event listener which make sure that
     * window doesn't get closed if CMD/CTRL W is pressed.
     * Too many users have that in their muscle memory.
     * Chrome doesn't let us rebind or prevent default the keybinding, so this
     * at least doesn't close the window immediately.
     */
    protected registerCtrlWHandling() {
        function isCtrlCmd(event: KeyboardEvent) {
            return (isOSX && event.metaKey) || (!isOSX && event.ctrlKey);
        }

        window.document.addEventListener('keydown', event => {
            this.shouldPreventClose = isCtrlCmd(event) && event.code === 'KeyW';
        });

        window.document.addEventListener('keyup', () => {
            this.shouldPreventClose = false;
        });
    }

    onWillStop() {
        try {
            if (this.shouldPreventClose || this.shell.canSaveAll()) {
                return true;
            }
        } finally {
            this.shouldPreventClose = false;
        }
    }
}
