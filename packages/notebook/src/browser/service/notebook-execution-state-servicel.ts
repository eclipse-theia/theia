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

import { URI } from '@theia/core';

export interface INotebookCellExecution {
    readonly notebook: URI;
    readonly cellHandle: number;
    readonly state: NotebookCellExecutionState;
    readonly didPause: boolean;
    readonly isPaused: boolean;

    confirm(): void;
    update(updates: CellExecuteUpdate[]): void;
    complete(complete: CellExecutionComplete): void;
}

export class NotebookExecutionStateService {
    createCellExecution(notebook: URI, cellHandle: number): NotebookCellExecution;
}
