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

import {
    CellData, CellOutput, CellOutputItem, CellRange, NotebookCellContentChangeEvent,
    NotebookCellsChangeInternalMetadataEvent,
    NotebookCellsChangeLanguageEvent,
    NotebookCellsChangeMetadataEvent,
    NotebookCellsChangeType, NotebookCellTextModelSplice, NotebookDocumentMetadata
} from '../common';
import { NotebookCell } from './view-model/notebook-cell-model';

export interface NotebookTextModelChangedEvent {
    readonly rawEvents: NotebookContentChangedEvent[];
    // readonly versionId: number;
    readonly synchronous?: boolean;
    readonly endSelectionState?: SelectionState;
};

export type NotebookContentChangedEvent = (NotebookCellsInitializeEvent<NotebookCell> | NotebookDocumentChangeMetadataEvent | NotebookCellContentChangeEvent |
    NotebookCellsModelChangedEvent<NotebookCell> | NotebookCellsModelMoveEvent<NotebookCell> | NotebookOutputChangedEvent | NotebookOutputItemChangedEvent |
    NotebookCellsChangeLanguageEvent | NotebookCellsChangeMetadataEvent |
    NotebookCellsChangeInternalMetadataEvent | NotebookDocumentUnknownChangeEvent); // & { transient: boolean };

export interface NotebookCellsInitializeEvent<T> {
    readonly kind: NotebookCellsChangeType.Initialize;
    readonly changes: NotebookCellTextModelSplice<T>[];
}

export interface NotebookDocumentChangeMetadataEvent {
    readonly kind: NotebookCellsChangeType.ChangeDocumentMetadata;
    readonly metadata: NotebookDocumentMetadata;
}

export interface NotebookCellsModelChangedEvent<T> {
    readonly kind: NotebookCellsChangeType.ModelChange;
    readonly changes: NotebookCellTextModelSplice<T>[];
}

export interface NotebookModelWillAddRemoveEvent {
    readonly rawEvent: NotebookCellsModelChangedEvent<CellData>;
};

export interface NotebookCellsModelMoveEvent<T> {
    readonly kind: NotebookCellsChangeType.Move;
    readonly index: number;
    readonly length: number;
    readonly newIdx: number;
    readonly cells: T[];
}

export interface NotebookOutputChangedEvent {
    readonly kind: NotebookCellsChangeType.Output;
    readonly index: number;
    readonly outputs: CellOutput[];
    readonly append: boolean;
}

export interface NotebookOutputItemChangedEvent {
    readonly kind: NotebookCellsChangeType.OutputItem;
    readonly index: number;
    readonly outputId: string;
    readonly outputItems: CellOutputItem[];
    readonly append: boolean;
}

export interface NotebookDocumentUnknownChangeEvent {
    readonly kind: NotebookCellsChangeType.Unknown;
}

export enum SelectionStateType {
    Handle = 0,
    Index = 1
}

export interface SelectionHandleState {
    kind: SelectionStateType.Handle;
    primary: number | null;
    selections: number[];
}

export interface SelectionIndexState {
    kind: SelectionStateType.Index;
    focus: CellRange;
    selections: CellRange[];
}

export type SelectionState = SelectionHandleState | SelectionIndexState;

export interface NotebookModelWillAddRemoveEvent {
    readonly newCellIds?: number[];
    readonly rawEvent: NotebookCellsModelChangedEvent<CellData>;
};
