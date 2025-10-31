// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { Command } from '../common/command';
import { nls } from '../common/nls';

export namespace CommonCommands {

    export const FILE_CATEGORY = 'File';
    export const VIEW_CATEGORY = 'View';
    export const CREATE_CATEGORY = 'Create';
    export const PREFERENCES_CATEGORY = 'Preferences';
    export const MANAGE_CATEGORY = 'Manage';
    export const FILE_CATEGORY_KEY = nls.getDefaultKey(FILE_CATEGORY);
    export const VIEW_CATEGORY_KEY = nls.getDefaultKey(VIEW_CATEGORY);
    export const PREFERENCES_CATEGORY_KEY = nls.getDefaultKey(PREFERENCES_CATEGORY);

    export const OPEN: Command = {
        id: 'core.open',
    };

    export const CUT = Command.toDefaultLocalizedCommand({
        id: 'core.cut',
        label: 'Cut'
    });
    export const COPY = Command.toDefaultLocalizedCommand({
        id: 'core.copy',
        label: 'Copy'
    });
    export const PASTE = Command.toDefaultLocalizedCommand({
        id: 'core.paste',
        label: 'Paste'
    });

    export const COPY_PATH = Command.toDefaultLocalizedCommand({
        id: 'core.copy.path',
        label: 'Copy Path'
    });

    export const UNDO = Command.toDefaultLocalizedCommand({
        id: 'core.undo',
        label: 'Undo'
    });
    export const REDO = Command.toDefaultLocalizedCommand({
        id: 'core.redo',
        label: 'Redo'
    });
    export const SELECT_ALL = Command.toDefaultLocalizedCommand({
        id: 'core.selectAll',
        label: 'Select All'
    });

    export const FIND = Command.toDefaultLocalizedCommand({
        id: 'core.find',
        label: 'Find'
    });
    export const REPLACE = Command.toDefaultLocalizedCommand({
        id: 'core.replace',
        label: 'Replace'
    });

    export const NEXT_TAB = Command.toDefaultLocalizedCommand({
        id: 'core.nextTab',
        category: VIEW_CATEGORY,
        label: 'Show Next Tab'
    });
    export const PREVIOUS_TAB = Command.toDefaultLocalizedCommand({
        id: 'core.previousTab',
        category: VIEW_CATEGORY,
        label: 'Show Previous Tab'
    });
    export const NEXT_TAB_IN_GROUP = Command.toLocalizedCommand({
        id: 'core.nextTabInGroup',
        category: VIEW_CATEGORY,
        label: 'Switch to Next Tab in Group'
    }, 'theia/core/common/showNextTabInGroup', VIEW_CATEGORY_KEY);
    export const PREVIOUS_TAB_IN_GROUP = Command.toLocalizedCommand({
        id: 'core.previousTabInGroup',
        category: VIEW_CATEGORY,
        label: 'Switch to Previous Tab in Group'
    }, 'theia/core/common/showPreviousTabInGroup', VIEW_CATEGORY_KEY);
    export const NEXT_TAB_GROUP = Command.toLocalizedCommand({
        id: 'core.nextTabGroup',
        category: VIEW_CATEGORY,
        label: 'Switch to Next Tab Group'
    }, 'theia/core/common/showNextTabGroup', VIEW_CATEGORY_KEY);
    export const PREVIOUS_TAB_GROUP = Command.toLocalizedCommand({
        id: 'core.previousTabBar',
        category: VIEW_CATEGORY,
        label: 'Switch to Previous Tab Group'
    }, 'theia/core/common/showPreviousTabGroup', VIEW_CATEGORY_KEY);
    export const CLOSE_TAB = Command.toLocalizedCommand({
        id: 'core.close.tab',
        category: VIEW_CATEGORY,
        label: 'Close Tab'
    }, 'theia/core/common/closeTab', VIEW_CATEGORY_KEY);
    export const CLOSE_OTHER_TABS = Command.toLocalizedCommand({
        id: 'core.close.other.tabs',
        category: VIEW_CATEGORY,
        label: 'Close Other Tabs'
    }, 'theia/core/common/closeOthers', VIEW_CATEGORY_KEY);
    export const CLOSE_SAVED_TABS = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.closeUnmodifiedEditors',
        category: VIEW_CATEGORY,
        label: 'Close Saved Editors in Group',
    });
    export const CLOSE_RIGHT_TABS = Command.toLocalizedCommand({
        id: 'core.close.right.tabs',
        category: VIEW_CATEGORY,
        label: 'Close Tabs to the Right'
    }, 'theia/core/common/closeRight', VIEW_CATEGORY_KEY);
    export const CLOSE_ALL_TABS = Command.toLocalizedCommand({
        id: 'core.close.all.tabs',
        category: VIEW_CATEGORY,
        label: 'Close All Tabs'
    }, 'theia/core/common/closeAll', VIEW_CATEGORY_KEY);
    export const CLOSE_MAIN_TAB = Command.toLocalizedCommand({
        id: 'core.close.main.tab',
        category: VIEW_CATEGORY,
        label: 'Close Tab in Main Area'
    }, 'theia/core/common/closeTabMain', VIEW_CATEGORY_KEY);
    export const CLOSE_OTHER_MAIN_TABS = Command.toLocalizedCommand({
        id: 'core.close.other.main.tabs',
        category: VIEW_CATEGORY,
        label: 'Close Other Tabs in Main Area'
    }, 'theia/core/common/closeOtherTabMain', VIEW_CATEGORY_KEY);
    export const CLOSE_ALL_MAIN_TABS = Command.toLocalizedCommand({
        id: 'core.close.all.main.tabs',
        category: VIEW_CATEGORY,
        label: 'Close All Tabs in Main Area'
    }, 'theia/core/common/closeAllTabMain', VIEW_CATEGORY_KEY);
    export const COLLAPSE_PANEL = Command.toLocalizedCommand({
        id: 'core.collapse.tab',
        category: VIEW_CATEGORY,
        label: 'Collapse Side Panel'
    }, 'theia/core/common/collapseTab', VIEW_CATEGORY_KEY);
    export const COLLAPSE_ALL_PANELS = Command.toLocalizedCommand({
        id: 'core.collapse.all.tabs',
        category: VIEW_CATEGORY,
        label: 'Collapse All Side Panels'
    }, 'theia/core/common/collapseAllTabs', VIEW_CATEGORY_KEY);
    export const TOGGLE_BOTTOM_PANEL = Command.toLocalizedCommand({
        id: 'core.toggle.bottom.panel',
        category: VIEW_CATEGORY,
        label: 'Toggle Bottom Panel'
    }, 'theia/core/common/collapseBottomPanel', VIEW_CATEGORY_KEY);
    export const TOGGLE_LEFT_PANEL = Command.toLocalizedCommand({
        id: 'core.toggle.left.panel',
        category: VIEW_CATEGORY,
        label: 'Toggle Left Panel'
    }, 'theia/core/common/collapseLeftPanel', VIEW_CATEGORY_KEY);
    export const TOGGLE_RIGHT_PANEL = Command.toLocalizedCommand({
        id: 'core.toggle.right.panel',
        category: VIEW_CATEGORY,
        label: 'Toggle Right Panel'
    }, 'theia/core/common/collapseRightPanel', VIEW_CATEGORY_KEY);
    export const TOGGLE_STATUS_BAR = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.toggleStatusbarVisibility',
        category: VIEW_CATEGORY,
        label: 'Toggle Status Bar Visibility'
    });
    export const PIN_TAB = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.pinEditor',
        category: VIEW_CATEGORY,
        label: 'Pin Editor'
    });
    export const UNPIN_TAB = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.unpinEditor',
        category: VIEW_CATEGORY,
        label: 'Unpin Editor'
    });
    export const TOGGLE_MAXIMIZED = Command.toLocalizedCommand({
        id: 'core.toggleMaximized',
        category: VIEW_CATEGORY,
        label: 'Toggle Maximized'
    }, 'theia/core/common/toggleMaximized', VIEW_CATEGORY_KEY);
    export const OPEN_VIEW = Command.toDefaultLocalizedCommand({
        id: 'core.openView',
        category: VIEW_CATEGORY,
        label: 'Open View...'
    });
    export const SHOW_MENU_BAR = Command.toDefaultLocalizedCommand({
        id: 'window.menuBarVisibility',
        category: VIEW_CATEGORY,
        label: 'Toggle Menu Bar'
    });
    /**
     * Command Parameters:
     * - `fileName`: string
     * - `directory`: URI
     */
    export const NEW_FILE = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.files.newFile',
        category: FILE_CATEGORY
    });
    // This command immediately opens a new untitled text file
    // Some VS Code extensions use this command to create new files
    export const NEW_UNTITLED_TEXT_FILE = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.files.newUntitledFile',
        category: FILE_CATEGORY,
        label: 'New Untitled Text File'
    });
    // This command opens a quick pick to select a file type to create
    export const PICK_NEW_FILE = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.files.pickNewFile',
        category: CREATE_CATEGORY,
        label: 'New File...'
    });
    export const SAVE = Command.toDefaultLocalizedCommand({
        id: 'core.save',
        category: FILE_CATEGORY,
        label: 'Save',
    });
    export const SAVE_AS = Command.toDefaultLocalizedCommand({
        id: 'file.saveAs',
        category: FILE_CATEGORY,
        label: 'Save As...',
    });
    export const SAVE_WITHOUT_FORMATTING = Command.toDefaultLocalizedCommand({
        id: 'core.saveWithoutFormatting',
        category: FILE_CATEGORY,
        label: 'Save without Formatting',
    });
    export const SAVE_ALL = Command.toDefaultLocalizedCommand({
        id: 'core.saveAll',
        category: FILE_CATEGORY,
        label: 'Save All',
    });

    export const AUTO_SAVE = Command.toDefaultLocalizedCommand({
        id: 'textEditor.commands.autosave',
        category: FILE_CATEGORY,
        label: 'Auto Save',
    });

    export const ABOUT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'core.about',
        label: 'About'
    });

    export const OPEN_PREFERENCES = Command.toDefaultLocalizedCommand({
        id: 'preferences:open',
        category: PREFERENCES_CATEGORY,
        label: 'Open Settings (UI)',
    });

    export const SELECT_COLOR_THEME = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.selectTheme',
        label: 'Color Theme',
        category: PREFERENCES_CATEGORY
    });
    export const SELECT_ICON_THEME = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.selectIconTheme',
        label: 'File Icon Theme',
        category: PREFERENCES_CATEGORY
    });

    export const CONFIGURE_DISPLAY_LANGUAGE = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.configureLanguage',
        label: 'Configure Display Language'
    });

    export const TOGGLE_BREADCRUMBS = Command.toDefaultLocalizedCommand({
        id: 'breadcrumbs.toggle',
        label: 'Toggle Breadcrumbs',
        category: VIEW_CATEGORY
    });
}
