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
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import {
    CellInternalMetadataChangedEvent, CellKind, NotebookCellCollapseState, NotebookCellInternalMetadata, NotebookCellMetadata, NotebookCellOutputsSplice, CellOutput, CellData
} from '../../common';
import { NotebookCellContextManager } from '../service/notebook-cell-context-manager';
import { NotebookCellOutputModel } from './notebook-cell-output-model';

export const NotebookCellModelFactory = Symbol('NotebookModelFactory');

export function createNotebookCellModelContainer(parent: interfaces.Container, props: NotebookCellModelProps): interfaces.Container {
    const child = parent.createChild();

    child.bind(NotebookCellModelProps).toConstantValue(props);
    child.bind(NotebookCellContextManager).toSelf().inSingletonScope();
    child.bind(NotebookCellModel).toSelf();

    return child;
}

const NotebookCellModelProps = Symbol('NotebookModelProps');
export interface NotebookCellModelProps {
    readonly uri: URI,
    readonly handle: number,
    source: string,
    language: string,
    readonly cellKind: CellKind,
    outputs: CellOutput[],
    metadata: NotebookCellMetadata | undefined,
    internalMetadata: NotebookCellInternalMetadata | undefined,
    readonly collapseState: NotebookCellCollapseState | undefined,

}

@injectable()
export class NotebookCellModel implements Disposable {

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

    private readonly requestCellEditChangeEmitter = new Emitter<boolean>();
    readonly onRequestCellEditChange = this.requestCellEditChangeEmitter.event;

    @inject(NotebookCellContextManager)
    protected notebookCellContextManager: NotebookCellContextManager;

    readonly outputs: NotebookCellOutputModel[];

    readonly metadata: NotebookCellMetadata;

    readonly internalMetadata: NotebookCellInternalMetadata;

    textModel: MonacoEditorModel;

    private htmlContext: HTMLLIElement;
    get context(): HTMLLIElement {
        return this.htmlContext;
    }

    get textBuffer(): string {
        return this.textModel ? this.textModel.getText() : this.source;
    }

    get source(): string {
        return this.props.source;
    }
    set source(source: string) {
        this.props.source = source;
    }
    get language(): string {
        return this.props.language;
    }
    get uri(): URI {
        return this.props.uri;
    }
    get handle(): number {
        return this.props.handle;
    }
    get cellKind(): CellKind {
        return this.props.cellKind;
    }

    constructor(@inject(NotebookCellModelProps) private props: NotebookCellModelProps,
    ) {
        this.outputs = props.outputs.map(op => new NotebookCellOutputModel(op));
        this.metadata = props.metadata ?? {};
        this.internalMetadata = props.internalMetadata ?? {};
    }

    refChanged(node: HTMLLIElement): void {
        if (node) {
            this.htmlContext = node;
            this.notebookCellContextManager.updateCellContext(this, node);
        }
    }

    dispose(): void {
        this.ChangeOutputsEmitter.dispose();
        this.ChangeOutputItemsEmitter.dispose();
        this.ChangeContentEmitter.dispose();
        this.ChangeMetadataEmitter.dispose();
        this.ChangeInternalMetadataEmitter.dispose();
        this.ChangeLanguageEmitter.dispose();
        this.notebookCellContextManager.dispose();
    }

    requestEdit(): void {
        this.requestCellEditChangeEmitter.fire(true);
    }

    requestStopEdit(): void {
        this.requestCellEditChangeEmitter.fire(false);
    }

    toDto(): CellData {
        return {
            cellKind: this.cellKind,
            language: this.language,
            outputs: this.outputs.map(output => output.toDto()),
            source: this.textBuffer,
            collapseState: this.props.collapseState,
            internalMetadata: this.internalMetadata,
            metadata: this.metadata
        };
    }
}
