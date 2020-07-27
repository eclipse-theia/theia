/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { Command } from '@theia/core/lib/common';

export namespace OutputCommands {

    const OUTPUT_CATEGORY = 'Output';

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

    export const CLEAR__WIDGET: Command = {
        id: 'output:widget:clear',
        category: OUTPUT_CATEGORY,
        iconClass: 'clear-all'
    };

    export const LOCK__WIDGET: Command = {
        id: 'output:widget:lock',
        category: OUTPUT_CATEGORY,
        iconClass: 'fa fa-unlock'
    };

    export const UNLOCK__WIDGET: Command = {
        id: 'output:widget:unlock',
        category: OUTPUT_CATEGORY,
        iconClass: 'fa fa-lock'
    };

    export const CLEAR__QUICK_PICK: Command = {
        id: 'output:pick-clear',
        label: 'Clear Output Channel...',
        category: OUTPUT_CATEGORY
    };

    export const SHOW__QUICK_PICK: Command = {
        id: 'output:pick-show',
        label: 'Show Output Channel...',
        category: OUTPUT_CATEGORY
    };

    export const HIDE__QUICK_PICK: Command = {
        id: 'output:pick-hide',
        label: 'Hide Output Channel...',
        category: OUTPUT_CATEGORY
    };

    export const DISPOSE__QUICK_PICK: Command = {
        id: 'output:pick-dispose',
        label: 'Close Output Channel...',
        category: OUTPUT_CATEGORY
    };

    export const COPY_ALL: Command = {
        id: 'output:copy-all',
    };

}
