// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { codicon } from '@theia/core/lib/browser';
import { Command, nls } from '@theia/core/lib/common';

export namespace OutputCommands {

    const OUTPUT_CATEGORY = 'Output';
    const OUTPUT_CATEGORY_KEY = nls.getDefaultKey(OUTPUT_CATEGORY);

    /* #region VS Code `OutputChannel` API */
    // Based on: https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/vscode.d.ts#L4692-L4745

    export const APPEND: Command = {
        id: 'output:append'
    };

    export const APPEND_LINE: Command = {
        id: 'output:appendLine'
    };

    export const CLEAR: Command = {
        id: 'output:clear'
    };

    export const SHOW: Command = {
        id: 'output:show'
    };

    export const HIDE: Command = {
        id: 'output:hide'
    };

    export const DISPOSE: Command = {
        id: 'output:dispose'
    };

    /* #endregion VS Code `OutputChannel` API */

    export const CLEAR__WIDGET = Command.toLocalizedCommand({
        id: 'output:widget:clear',
        category: OUTPUT_CATEGORY,
        iconClass: codicon('clear-all')
    }, '', OUTPUT_CATEGORY_KEY);

    export const LOCK__WIDGET = Command.toLocalizedCommand({
        id: 'output:widget:lock',
        category: OUTPUT_CATEGORY,
        iconClass: codicon('unlock')
    }, '', OUTPUT_CATEGORY_KEY);

    export const UNLOCK__WIDGET = Command.toLocalizedCommand({
        id: 'output:widget:unlock',
        category: OUTPUT_CATEGORY,
        iconClass: codicon('lock')
    }, '', OUTPUT_CATEGORY_KEY);

    export const CLEAR__QUICK_PICK = Command.toLocalizedCommand({
        id: 'output:pick-clear',
        label: 'Clear Output Channel...',
        category: OUTPUT_CATEGORY
    }, 'theia/output/clearOutputChannel', OUTPUT_CATEGORY_KEY);

    export const SHOW__QUICK_PICK = Command.toLocalizedCommand({
        id: 'output:pick-show',
        label: 'Show Output Channel...',
        category: OUTPUT_CATEGORY
    }, 'theia/output/showOutputChannel', OUTPUT_CATEGORY_KEY);

    export const HIDE__QUICK_PICK = Command.toLocalizedCommand({
        id: 'output:pick-hide',
        label: 'Hide Output Channel...',
        category: OUTPUT_CATEGORY
    }, 'theia/output/hideOutputChannel', OUTPUT_CATEGORY_KEY);

    export const DISPOSE__QUICK_PICK = Command.toLocalizedCommand({
        id: 'output:pick-dispose',
        label: 'Close Output Channel...',
        category: OUTPUT_CATEGORY
    }, 'theia/output/closeOutputChannel', OUTPUT_CATEGORY_KEY);

    export const COPY_ALL: Command = {
        id: 'output:copy-all',
    };

}
