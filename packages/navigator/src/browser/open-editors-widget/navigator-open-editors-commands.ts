/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { CommonCommands } from '@theia/core/lib/browser';
import { Command } from '@theia/core/lib/common';

export namespace OpenEditorsCommands {
    export const CLOSE_ALL_TABS_FROM_TOOLBAR = Command.toLocalizedCommand({
        id: 'navigator.close.all.editors.toolbar',
        category: CommonCommands.FILE_CATEGORY,
        label: 'Close All Editors',
        iconClass: 'codicon codicon-close-all'
    }, 'vscode/editorActions/closeAllEditors', CommonCommands.FILE_CATEGORY_KEY);

    export const SAVE_ALL_TABS_FROM_TOOLBAR = Command.toLocalizedCommand({
        id: 'navigator.save.all.editors.toolbar',
        category: CommonCommands.FILE_CATEGORY,
        label: 'Save All Editors',
        iconClass: 'codicon codicon-save-all'
    }, 'vscode/fileActions.contribution/saveFiles', CommonCommands.FILE_CATEGORY_KEY);

    export const CLOSE_ALL_EDITORS_IN_GROUP_FROM_ICON = Command.toLocalizedCommand({
        id: 'navigator.close.all.in.area.icon',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Close Group',
        iconClass: 'codicon codicon-close-all'
    }, 'vscode/fileActions/closeGroup', CommonCommands.VIEW_CATEGORY_KEY);

    export const SAVE_ALL_IN_GROUP_FROM_ICON = Command.toLocalizedCommand({
        id: 'navigator.save.all.in.area.icon',
        category: CommonCommands.FILE_CATEGORY,
        label: 'Save All in Group',
        iconClass: 'codicon codicon-save-all'
    }, 'vscode/fileActions.contribution/saveAllInGroup', CommonCommands.FILE_CATEGORY_KEY);
}
