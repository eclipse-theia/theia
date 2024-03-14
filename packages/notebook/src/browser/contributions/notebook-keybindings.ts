
// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { NotebookCellCommands } from './notebook-cell-actions-contribution';
import { NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_CELL_FOCUSED, NOTEBOOK_EDITOR_FOCUSED } from './notebook-context-keys';

export class NotebookKeybinding implements KeybindingContribution {

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybindings(
            {
                command: NotebookCellCommands.EDIT_COMMAND.id,
                keybinding: 'Enter',
                when: `${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED} && !${NOTEBOOK_CELL_EDITOR_FOCUSED}`,
            }
        );
    }
}
