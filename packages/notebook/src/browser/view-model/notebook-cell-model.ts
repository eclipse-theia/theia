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
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { ContextKeyChangeEvent } from '@theia/core/lib/browser/context-key-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import {
    CellKind, NotebookCellCollapseState, NotebookCellInternalMetadata,
    NotebookCellMetadata, CellOutput, CellData, CellOutputItem
} from '../../common';
import { NotebookCellOutputsSplice } from '../notebook-types';
import { NotebookCellOutputModel } from './notebook-cell-output-model';

export const NotebookCellModelFactory = Symbol('NotebookModelFactory');
export type NotebookCellModelFactory = (props: NotebookCellModelProps) => NotebookCellModel;

export function createNotebookCellModelContainer(parent: interfaces.Container, props: NotebookCellModelProps,
    notebookCellContextManager: new (...args: never[]) => unknown): interfaces.Container {
    const child = parent.createChild();

    child.bind(NotebookCellModelProps).toConstantValue(props);
    // We need the constructor as property here to avoid circular dependencies for the context manager
    child.bind(NotebookCellContextManager).to(notebookCellContextManager).inSingletonScope();
    child.bind(NotebookCellModel).toSelf();

    return child;
}

const NotebookCellContextManager = Symbol('NotebookCellContextManager');
interface NotebookCellContextManager {
    updateCellContext(cell: NotebookCellModel, context: HTMLElement): void;
    dispose(): void;
    onDidChangeContext: Event<ContextKeyChangeEvent>;
}

export interface CellInternalMetadataChangedEvent {
    readonly lastRunSuccessChanged?: boolean;
}

export interface NotebookCell {
    readonly uri: URI;
    handle: number;
    language: string;
    cellKind: CellKind;
    outputs: CellOutput[];
    metadata: NotebookCellMetadata;
    internalMetadata: NotebookCellInternalMetadata;
    text: string;
    onDidChangeOutputs?: Event<NotebookCellOutputsSplice>;
    onDidChangeOutputItems?: Event<CellOutput>;
    onDidChangeLanguage: Event<string>;
    onDidChangeMetadata: Event<void>;
    onDidChangeInternalMetadata: Event<CellInternalMetadataChangedEvent>;

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

    protected readonly onDidChangeOutputsEmitter = new Emitter<NotebookCellOutputsSplice>();
    readonly onDidChangeOutputs: Event<NotebookCellOutputsSplice> = this.onDidChangeOutputsEmitter.event;

    protected readonly onDidChangeOutputItemsEmitter = new Emitter<CellOutput>();
    readonly onDidChangeOutputItems: Event<CellOutput> = this.onDidChangeOutputItemsEmitter.event;

    protected readonly onDidChangeContentEmitter = new Emitter<'content' | 'language' | 'mime'>();
    readonly onDidChangeContent: Event<'content' | 'language' | 'mime'> = this.onDidChangeContentEmitter.event;

    protected readonly onDidChangeMetadataEmitter = new Emitter<void>();
    readonly onDidChangeMetadata: Event<void> = this.onDidChangeMetadataEmitter.event;

    protected readonly onDidChangeInternalMetadataEmitter = new Emitter<CellInternalMetadataChangedEvent>();
    readonly onDidChangeInternalMetadata: Event<CellInternalMetadataChangedEvent> = this.onDidChangeInternalMetadataEmitter.event;

    protected readonly onDidChangeLanguageEmitter = new Emitter<string>();
    readonly onDidChangeLanguage: Event<string> = this.onDidChangeLanguageEmitter.event;

    protected readonly onDidRequestCellEditChangeEmitter = new Emitter<boolean>();
    readonly onDidRequestCellEditChange = this.onDidRequestCellEditChangeEmitter.event;

    @inject(NotebookCellContextManager)
    readonly notebookCellContextManager: NotebookCellContextManager;

    @inject(NotebookCellModelProps)
    protected readonly props: NotebookCellModelProps;
    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    get outputs(): NotebookCellOutputModel[] {
        return this._outputs;
    }

    protected _outputs: NotebookCellOutputModel[];

    get metadata(): NotebookCellMetadata {
        return this._metadata;
    }

    protected _metadata: NotebookCellMetadata;

    protected toDispose = new DisposableCollection();

    protected _internalMetadata: NotebookCellInternalMetadata;

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
        this.onDidChangeInternalMetadataEmitter.fire({ lastRunSuccessChanged });

    }

    textModel: MonacoEditorModel;

    protected htmlContext: HTMLLIElement;

    get context(): HTMLLIElement {
        return this.htmlContext;
    }

    get text(): string {
        return this.textModel ? this.textModel.getText() : this.source;
    }

    get source(): string {
        return this.props.source;
    }
    set source(source: string) {
        this.props.source = source;
        this.textModel?.textEditorModel.setValue(source);
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
        this.onDidChangeLanguageEmitter.fire(newLanguage);
        this.onDidChangeContentEmitter.fire('language');
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

    @postConstruct()
    protected init(): void {
        this._outputs = this.props.outputs.map(op => new NotebookCellOutputModel(op));
        this._metadata = this.props.metadata ?? {};
        this._internalMetadata = this.props.internalMetadata ?? {};
    }

    refChanged(node: HTMLLIElement): void {
        if (node) {
            this.htmlContext = node;
            this.notebookCellContextManager.updateCellContext(this, node);
        }
    }

    dispose(): void {
        this.onDidChangeOutputsEmitter.dispose();
        this.onDidChangeOutputItemsEmitter.dispose();
        this.onDidChangeContentEmitter.dispose();
        this.onDidChangeMetadataEmitter.dispose();
        this.onDidChangeInternalMetadataEmitter.dispose();
        this.onDidChangeLanguageEmitter.dispose();
        this.notebookCellContextManager.dispose();
        this.textModel.dispose();
        this.toDispose.dispose();
    }

    requestEdit(): void {
        this.onDidRequestCellEditChangeEmitter.fire(true);
    }

    requestStopEdit(): void {
        this.onDidRequestCellEditChangeEmitter.fire(false);
    }

    spliceNotebookCellOutputs(splice: NotebookCellOutputsSplice): void {
        if (splice.deleteCount > 0 && splice.newOutputs.length > 0) {
            const commonLen = Math.min(splice.deleteCount, splice.newOutputs.length);
            // update
            for (let i = 0; i < commonLen; i++) {
                const currentOutput = this.outputs[splice.start + i];
                const newOutput = splice.newOutputs[i];

                this.replaceOutputData(currentOutput.outputId, newOutput);
            }

            this.outputs.splice(splice.start + commonLen, splice.deleteCount - commonLen, ...splice.newOutputs.slice(commonLen).map(op => new NotebookCellOutputModel(op)));
            this.onDidChangeOutputsEmitter.fire({ start: splice.start + commonLen, deleteCount: splice.deleteCount - commonLen, newOutputs: splice.newOutputs.slice(commonLen) });
        } else {
            this.outputs.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(op => new NotebookCellOutputModel(op)));
            this.onDidChangeOutputsEmitter.fire(splice);
        }
    }

    replaceOutputData(outputId: string, newOutputData: CellOutput): boolean {
        const output = this.outputs.find(out => out.outputId === outputId);

        if (!output) {
            return false;
        }

        output.replaceData(newOutputData);
        this.onDidChangeOutputItemsEmitter.fire(output);
        return true;
    }

    changeOutputItems(outputId: string, append: boolean, items: CellOutputItem[]): boolean {
        const output = this.outputs.find(out => out.outputId === outputId);

        if (!output) {
            return false;
        }

        if (append) {
            output.appendData(items);
        } else {
            output.replaceData({ outputId: outputId, outputs: items, metadata: output.metadata });
        }
        this.onDidChangeOutputItemsEmitter.fire(output);
        return true;
    }

    getData(): CellData {
        return {
            cellKind: this.cellKind,
            language: this.language,
            outputs: this.outputs.map(output => output.getData()),
            source: this.text,
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
        this.textModel.onDidChangeContent(e => {
            this.props.source = e.model.getText();
        });
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
