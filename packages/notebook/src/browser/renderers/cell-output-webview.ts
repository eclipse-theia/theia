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

import { Disposable, Event } from '@theia/core';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { NotebookContentChangedEvent } from '../notebook-types';
import { NotebookCellOutputModel } from '../view-model/notebook-cell-output-model';
import { NotebookCellModel } from '../view-model/notebook-cell-model';

export const CellOutputWebviewFactory = Symbol('outputWebviewFactory');
export const CellOutputWebview = Symbol('outputWebview');

export type CellOutputWebviewFactory = () => Promise<CellOutputWebview>;

export interface OutputRenderEvent {
    cellHandle: number;
    outputId: string;
    outputHeight: number;
}

export interface CellOutputWebview extends Disposable {

    readonly id: string;

    init(notebook: NotebookModel, editor: NotebookEditorWidget): void;

    render(): React.ReactNode;

    setCellHeight(cell: NotebookCellModel, height: number): void;
    cellsChanged(cellEvent: NotebookContentChangedEvent[]): void;
    onDidRenderOutput: Event<OutputRenderEvent>

    requestOutputPresentationUpdate(cellHandle: number, output: NotebookCellOutputModel): void;

    attachWebview(): void;
    isAttached(): boolean
}
