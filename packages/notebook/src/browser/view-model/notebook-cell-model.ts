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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, Emitter, Event, URI } from '@theia/core';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import {
    Cell,
    CellDto,
    CellInternalMetadataChangedEvent, CellKind, NotebookCellCollapseState, NotebookCellInternalMetadata, NotebookCellMetadata, NotebookCellOutputsSplice, OutputDto
} from '../../common';
import { NotebookCellOutputModel } from './notebook-cell-output-model';

export class NotebookCellModel implements Disposable, Cell {

    private readonly ChangeOutputsEmitter = new Emitter<NotebookCellOutputsSplice>();
    readonly onDidChangeOutputs: Event<NotebookCellOutputsSplice> = this.ChangeOutputsEmitter.event;

    private readonly ChangeOutputItemsEmitter = new Emitter<void>();
    readonly onDidChangeOutputItems: Event<void> = this.ChangeOutputItemsEmitter.event;

    private readonly ChangeContentEmitter = new Emitter<'content' | 'language' | 'mime'>();
    readonly onDidChangeContent: Event<'content' | 'language' | 'mime'> = this.ChangeContentEmitter.event;

    private readonly ChangeMetadataEmitter = new Emitter<void>();
    readonly onDidChangeMetadata: Event<void> = this.ChangeMetadataEmitter.event;

    private readonly ChangeInternalMetadataEmitter = new Emitter<CellInternalMetadataChangedEvent>();
    readonly onDidChangeInternalMetadata: Event<CellInternalMetadataChangedEvent> = this.ChangeInternalMetadataEmitter.event;

    private readonly ChangeLanguageEmitter = new Emitter<string>();
    readonly onDidChangeLanguage: Event<string> = this.ChangeLanguageEmitter.event;

    private readonly requestCellEditEmitter = new Emitter<void>();
    readonly onRequestCellEdit = this.requestCellEditEmitter.event;

    readonly outputs: NotebookCellOutputModel[];

    readonly metadata: NotebookCellMetadata;

    readonly internalMetadata: NotebookCellInternalMetadata;

    textModel: MonacoEditorModel;

    get textBuffer(): string {
        return this.textModel ? this.textModel.getText() : this.source;
    }

    constructor(
        readonly uri: URI,
        public readonly handle: number,
        public source: string,
        public language: string,
        public readonly cellKind: CellKind,
        outputs: OutputDto[],
        metadata: NotebookCellMetadata | undefined,
        internalMetadata: NotebookCellInternalMetadata | undefined,
        public readonly collapseState: NotebookCellCollapseState | undefined,
    ) {
        this.outputs = outputs.map(op => new NotebookCellOutputModel(op));
        this.metadata = metadata ?? {};
        this.internalMetadata = internalMetadata ?? {};
    }

    dispose(): void {
        this.ChangeOutputsEmitter.dispose();
        this.ChangeOutputItemsEmitter.dispose();
        this.ChangeContentEmitter.dispose();
        this.ChangeMetadataEmitter.dispose();
        this.ChangeInternalMetadataEmitter.dispose();
        this.ChangeLanguageEmitter.dispose();
    }

    requestEdit(): void {
        this.requestCellEditEmitter.fire();
    }

    toDto(): CellDto {
        return {
            cellKind: this.cellKind,
            language: this.language,
            outputs: this.outputs.map(output => output.toDto()),
            source: this.textBuffer,
            collapseState: this.collapseState,
            internalMetadata: this.internalMetadata,
            metadata: this.metadata
        };
    }
}
