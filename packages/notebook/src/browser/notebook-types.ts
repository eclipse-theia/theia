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
    CellData, CellEditType, CellMetadataEdit, CellOutput, CellOutputItem, CellRange, NotebookCellContentChangeEvent,
    NotebookCellInternalMetadata,
    NotebookCellMetadata,
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

export interface CellOutputEdit {
    editType: CellEditType.Output;
    index: number;
    outputs: CellOutput[];
    deleteCount?: number;
    append?: boolean;
}

export interface CellOutputEditByHandle {
    editType: CellEditType.Output;
    handle: number;
    outputs: CellOutput[];
    deleteCount?: number;
    append?: boolean;
}

export interface CellOutputItemEdit {
    editType: CellEditType.OutputItems;
    items: CellOutputItem[];
    outputId: string;
    append?: boolean;
}

export interface CellLanguageEdit {
    editType: CellEditType.CellLanguage;
    index: number;
    language: string;
}

export interface DocumentMetadataEdit {
    editType: CellEditType.DocumentMetadata;
    metadata: NotebookDocumentMetadata;
}

export interface CellMoveEdit {
    editType: CellEditType.Move;
    index: number;
    length: number;
    newIdx: number;
}

export interface CellReplaceEdit {
    editType: CellEditType.Replace;
    index: number;
    count: number;
    cells: CellData[];
}

export interface CellPartialMetadataEdit {
    editType: CellEditType.PartialMetadata;
    index: number;
    metadata: NullablePartialNotebookCellMetadata;
}

export type ImmediateCellEditOperation = CellOutputEditByHandle | CellOutputItemEdit | CellPartialInternalMetadataEditByHandle; // add more later on
export type CellEditOperation = ImmediateCellEditOperation | CellReplaceEdit | CellOutputEdit |
    CellMetadataEdit | CellLanguageEdit | DocumentMetadataEdit | CellMoveEdit | CellPartialMetadataEdit; // add more later on

export type NullablePartialNotebookCellInternalMetadata = {
    [Key in keyof Partial<NotebookCellInternalMetadata>]: NotebookCellInternalMetadata[Key] | null
};

export type NullablePartialNotebookCellMetadata = {
    [Key in keyof Partial<NotebookCellMetadata>]: NotebookCellMetadata[Key] | null
};

export interface CellPartialInternalMetadataEditByHandle {
    editType: CellEditType.PartialInternalMetadata;
    handle: number;
    internalMetadata: NullablePartialNotebookCellInternalMetadata;
}

export interface NotebookCellOutputsSplice {
    start: number;
    deleteCount: number;
    newOutputs: CellOutput[];
};
