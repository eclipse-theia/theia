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

import { Disposable, DisposableCollection, Emitter, Event, URI } from '@theia/core';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { notebookCellMonacoTextmodelService } from '../view/notebook-cell-editor';
import {
    CellInternalMetadataChangedEvent, CellKind, NotebookCellCollapseState, NotebookCellInternalMetadata,
    NotebookCellMetadata, NotebookCellOutputsSplice, CellOutput, CellData, NotebookCell
} from '../../common';
import { NotebookCellOutputModel } from './notebook-cell-output-model';

export const NotebookCellModelFactory = Symbol('NotebookModelFactory');

export function createNotebookCellModelContainer(parent: interfaces.Container, props: NotebookCellModelProps,
    notebookCellContextManager: new (...args: never[]) => unknown): interfaces.Container {
    const child = parent.createChild();

    child.bind(NotebookCellModelProps).toConstantValue(props);
    // We need the constructor as property here to avoid circular dependencies for the context manager
    child.bind(NotebookCellContextManagerSymbol).to(notebookCellContextManager).inSingletonScope();
    child.bind(NotebookCellModel).toSelf();

    return child;
}

const NotebookCellContextManagerSymbol = Symbol('NotebookCellContextManager');
interface NotebookCellContextManager {
    updateCellContext(cell: NotebookCellModel, context: HTMLElement): void;
    dispose(): void;
}

const NotebookCellModelProps = Symbol('NotebookModelProps');
export interface NotebookCellModelProps {
    readonly uri: URI,
    readonly handle: number,
    source: string,
    language: string,
    readonly cellKind: CellKind,
    outputs: CellOutput[],
    metadata?: NotebookCellMetadata | undefined,
    internalMetadata?: NotebookCellInternalMetadata | undefined,
    readonly collapseState?: NotebookCellCollapseState | undefined,

}

@injectable()
export class NotebookCellModel implements NotebookCell, Disposable {

    private readonly didChangeOutputsEmitter = new Emitter<NotebookCellOutputsSplice>();
    readonly onDidChangeOutputs: Event<NotebookCellOutputsSplice> = this.didChangeOutputsEmitter.event;

    private readonly didChangeOutputItemsEmitter = new Emitter<void>();
    readonly onDidChangeOutputItems: Event<void> = this.didChangeOutputItemsEmitter.event;

    private readonly didChangeContentEmitter = new Emitter<'content' | 'language' | 'mime'>();
    readonly onDidChangeContent: Event<'content' | 'language' | 'mime'> = this.didChangeContentEmitter.event;

    private readonly didChangeMetadataEmitter = new Emitter<void>();
    readonly onDidChangeMetadata: Event<void> = this.didChangeMetadataEmitter.event;

    private readonly didChangeInternalMetadataEmitter = new Emitter<CellInternalMetadataChangedEvent>();
    readonly onDidChangeInternalMetadata: Event<CellInternalMetadataChangedEvent> = this.didChangeInternalMetadataEmitter.event;

    private readonly didChangeLanguageEmitter = new Emitter<string>();
    readonly onDidChangeLanguage: Event<string> = this.didChangeLanguageEmitter.event;

    private readonly requestCellEditChangeEmitter = new Emitter<boolean>();
    readonly onRequestCellEditChange = this.requestCellEditChangeEmitter.event;

    @inject(NotebookCellContextManagerSymbol)
    protected notebookCellContextManager: NotebookCellContextManager;

    readonly outputs: NotebookCellOutputModel[];

    readonly metadata: NotebookCellMetadata;

    readonly toDispose = new DisposableCollection();

    private _internalMetadata: NotebookCellInternalMetadata;

    get internalMetadata(): NotebookCellInternalMetadata {
        return this._internalMetadata;
    }

    set internalMetadata(newInternalMetadata: NotebookCellInternalMetadata) {
        const lastRunSuccessChanged = this._internalMetadata.lastRunSuccess !== newInternalMetadata.lastRunSuccess;
        newInternalMetadata = {
            ...newInternalMetadata,
            ...{ runStartTimeAdjustment: computeRunStartTimeAdjustment(this._internalMetadata, newInternalMetadata) }
        };
        this._internalMetadata = newInternalMetadata;
        this.didChangeInternalMetadataEmitter.fire({ lastRunSuccessChanged });

    }

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

    set language(newLanguage: string) {
        if (this.language === newLanguage) {
            return;
        }

        this.props.language = newLanguage;
        if (this.textModel) {
            this.textModel.setLanguageId(newLanguage);
        }

        this.language = newLanguage;
        this.didChangeLanguageEmitter.fire(newLanguage);
        this.didChangeContentEmitter.fire('language');
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
        @inject(notebookCellMonacoTextmodelService) private textModelService: MonacoTextModelService,
    ) {
        this.outputs = props.outputs.map(op => new NotebookCellOutputModel(op));
        this.metadata = props.metadata ?? {};
        this._internalMetadata = props.internalMetadata ?? {};
    }

    refChanged(node: HTMLLIElement): void {
        if (node) {
            this.htmlContext = node;
            this.notebookCellContextManager.updateCellContext(this, node);
        }
    }

    dispose(): void {
        this.didChangeOutputsEmitter.dispose();
        this.didChangeOutputItemsEmitter.dispose();
        this.didChangeContentEmitter.dispose();
        this.didChangeMetadataEmitter.dispose();
        this.didChangeInternalMetadataEmitter.dispose();
        this.didChangeLanguageEmitter.dispose();
        this.notebookCellContextManager.dispose();
        this.toDispose.dispose();
    }

    requestEdit(): void {
        this.requestCellEditChangeEmitter.fire(true);
    }

    requestStopEdit(): void {
        this.requestCellEditChangeEmitter.fire(false);
    }

    spliceNotebookCellOutputs(splice: NotebookCellOutputsSplice): void {
        if (splice.deleteCount > 0 && splice.newOutputs.length > 0) {
            const commonLen = Math.min(splice.deleteCount, splice.newOutputs.length);
            // update
            for (let i = 0; i < commonLen; i++) {
                const currentOutput = this.outputs[splice.start + i];
                const newOutput = splice.newOutputs[i];

                this.replaceOutputItems(currentOutput.outputId, newOutput);
            }

            this.outputs.splice(splice.start + commonLen, splice.deleteCount - commonLen, ...splice.newOutputs.slice(commonLen).map(op => new NotebookCellOutputModel(op)));
            this.didChangeOutputsEmitter.fire({ start: splice.start + commonLen, deleteCount: splice.deleteCount - commonLen, newOutputs: splice.newOutputs.slice(commonLen) });
        } else {
            this.outputs.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(op => new NotebookCellOutputModel(op)));
            this.didChangeOutputsEmitter.fire(splice);
        }
    }

    replaceOutputItems(outputId: string, newOutputItem: CellOutput): boolean {
        const output = this.outputs.find(out => out.outputId === outputId);

        if (!output) {
            return false;
        }

        output.replaceData(newOutputItem);
        this.didChangeOutputItemsEmitter.fire();
        return true;
    }

    getData(): CellData {
        return {
            cellKind: this.cellKind,
            language: this.language,
            outputs: this.outputs.map(output => output.getData()),
            source: this.textBuffer,
            collapseState: this.props.collapseState,
            internalMetadata: this.internalMetadata,
            metadata: this.metadata
        };
    }

    async resolveTextModel(): Promise<MonacoEditorModel> {
        if (this.textModel) {
            return this.textModel;
        }

        const ref = await this.textModelService.createModelReference(this.uri);
        this.textModel = ref.object;
        return ref.object;
    }
}

function computeRunStartTimeAdjustment(oldMetadata: NotebookCellInternalMetadata, newMetadata: NotebookCellInternalMetadata): number | undefined {
    if (oldMetadata.runStartTime !== newMetadata.runStartTime && typeof newMetadata.runStartTime === 'number') {
        const offset = Date.now() - newMetadata.runStartTime;
        return offset < 0 ? Math.abs(offset) : 0;
    } else {
        return newMetadata.runStartTimeAdjustment;
    }
}
