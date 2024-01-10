// *****************************************************************************
// Copyright (C) 2023 Typefox and others.
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

declare module '@theia/plugin' {

    // https://github.com/microsoft/vscode/issues/124970

    /**
     * The execution state of a notebook cell.
     */
    export enum NotebookCellExecutionState {
        /**
         * The cell is idle.
         */
        Idle = 1,
        /**
         * Execution for the cell is pending.
         */
        Pending = 2,
        /**
         * The cell is currently executing.
         */
        Executing = 3,
    }

    /**
     * An event describing a cell execution state change.
     */
    export interface NotebookCellExecutionStateChangeEvent {
        /**
         * The {@link NotebookCell cell} for which the execution state has changed.
         */
        readonly cell: NotebookCell;

        /**
         * The new execution state of the cell.
         */
        readonly state: NotebookCellExecutionState;
    }

    export namespace notebooks {

        /**
         * An {@link Event} which fires when the execution state of a cell has changed.
         */
        // todo@API this is an event that is fired for a property that cells don't have and that makes me wonder
        // how a correct consumer works, e.g the consumer could have been late and missed an event?
        export const onDidChangeNotebookCellExecutionState: Event<NotebookCellExecutionStateChangeEvent>;
    }
}
