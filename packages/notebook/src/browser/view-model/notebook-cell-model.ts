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
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { type MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import {
    CellKind, NotebookCellCollapseState, NotebookCellInternalMetadata,
    NotebookCellMetadata, CellOutput, CellData, CellOutputItem
} from '../../common';
import { NotebookCellOutputsSplice } from '../notebook-types';
import { NotebookMonacoTextModelService } from '../service/notebook-monaco-text-model-service';
import { NotebookCellOutputModel } from './notebook-cell-output-model';
import { PreferenceService } from '@theia/core/lib/browser';
import { NotebookPreferences } from '../contributions/notebook-preferences';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { NotebookEditorFindMatch, NotebookEditorFindMatchOptions } from '../view/notebook-find-widget';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';

export const NotebookCellModelFactory = Symbol('NotebookModelFactory');
export type NotebookCellModelFactory = (props: NotebookCellModelProps) => NotebookCellModel;

export type CellEditorFocusRequest = number | 'lastLine' | undefined;

export function createNotebookCellModelContainer(parent: interfaces.Container, props: NotebookCellModelProps): interfaces.Container {
    const child = parent.createChild();

    child.bind(NotebookCellModelProps).toConstantValue(props);
    child.bind(NotebookCellModel).toSelf();

    return child;
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
    /**
     * The selection of the cell. Zero-based line/character coordinates.
     */
    selection: Range | undefined;
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
    readonly onDidChangeOutputs = this.onDidChangeOutputsEmitter.event;

    protected readonly onDidChangeOutputItemsEmitter = new Emitter<CellOutput>();
    readonly onDidChangeOutputItems = this.onDidChangeOutputItemsEmitter.event;

    protected readonly onDidChangeContentEmitter = new Emitter<'content' | 'language' | 'mime'>();
    readonly onDidChangeContent = this.onDidChangeContentEmitter.event;

    protected readonly onDidChangeMetadataEmitter = new Emitter<void>();
    readonly onDidChangeMetadata = this.onDidChangeMetadataEmitter.event;

    protected readonly onDidChangeInternalMetadataEmitter = new Emitter<CellInternalMetadataChangedEvent>();
    readonly onDidChangeInternalMetadata = this.onDidChangeInternalMetadataEmitter.event;

    protected readonly onDidChangeLanguageEmitter = new Emitter<string>();
    readonly onDidChangeLanguage = this.onDidChangeLanguageEmitter.event;

    protected readonly onDidRequestCellEditChangeEmitter = new Emitter<boolean>();
    readonly onDidRequestCellEditChange = this.onDidRequestCellEditChangeEmitter.event;

    protected readonly onWillFocusCellEditorEmitter = new Emitter<CellEditorFocusRequest>();
    readonly onWillFocusCellEditor = this.onWillFocusCellEditorEmitter.event;

    protected readonly onWillBlurCellEditorEmitter = new Emitter<void>();
    readonly onWillBlurCellEditor = this.onWillBlurCellEditorEmitter.event;

    protected readonly onDidChangeEditorOptionsEmitter = new Emitter<MonacoEditor.IOptions>();
    readonly onDidChangeEditorOptions = this.onDidChangeEditorOptionsEmitter.event;

    protected readonly outputVisibilityChangeEmitter = new Emitter<boolean>();
    readonly onDidChangeOutputVisibility = this.outputVisibilityChangeEmitter.event;

    protected readonly onDidFindMatchesEmitter = new Emitter<NotebookCodeEditorFindMatch[]>();
    readonly onDidFindMatches: Event<NotebookCodeEditorFindMatch[]> = this.onDidFindMatchesEmitter.event;

    protected readonly onDidSelectFindMatchEmitter = new Emitter<NotebookCodeEditorFindMatch>();
    readonly onDidSelectFindMatch: Event<NotebookCodeEditorFindMatch> = this.onDidSelectFindMatchEmitter.event;

    protected onDidRequestCenterEditorEmitter = new Emitter<void>();
    readonly onDidRequestCenterEditor = this.onDidRequestCenterEditorEmitter.event;

    protected onDidCellHeightChangeEmitter = new Emitter<number>();
    readonly onDidCellHeightChange = this.onDidCellHeightChangeEmitter.event;

    @inject(NotebookCellModelProps)
    protected readonly props: NotebookCellModelProps;

    @inject(NotebookMonacoTextModelService)
    protected readonly textModelService: NotebookMonacoTextModelService;

    @inject(LanguageService)
    protected readonly languageService: LanguageService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    get outputs(): NotebookCellOutputModel[] {
        return this._outputs;
    }

    protected _outputs: NotebookCellOutputModel[];

    get metadata(): NotebookCellMetadata {
        return this._metadata;
    }

    set metadata(newMetadata: NotebookCellMetadata) {
        this._metadata = newMetadata;
        this.onDidChangeMetadataEmitter.fire();
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

    protected textModel?: MonacoEditorModel;

    get text(): string {
        return this.textModel && !this.textModel.isDisposed() ? this.textModel.getText() : this.source;
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

        if (this.textModel) {
            this.textModel.setLanguageId(newLanguage);
        }

        this.props.language = newLanguage;
        this.onDidChangeLanguageEmitter.fire(newLanguage);
        this.onDidChangeContentEmitter.fire('language');
    }

    get languageName(): string {
        return this.languageService.getLanguage(this.language)?.name ?? this.language;
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

    protected _editing: boolean = false;
    get editing(): boolean {
        return this._editing;
    }

    protected _editorOptions: MonacoEditor.IOptions = {};
    get editorOptions(): Readonly<MonacoEditor.IOptions> {
        return this._editorOptions;
    }

    set editorOptions(options: MonacoEditor.IOptions) {
        this._editorOptions = options;
        this.onDidChangeEditorOptionsEmitter.fire(options);
    }

    protected _outputVisible: boolean = true;
    get outputVisible(): boolean {
        return this._outputVisible;
    }

    set outputVisible(visible: boolean) {
        if (this._outputVisible !== visible) {
            this._outputVisible = visible;
            this.outputVisibilityChangeEmitter.fire(visible);
        }
    }

    protected _selection: Range | undefined = undefined;

    get selection(): Range | undefined {
        return this._selection;
    }

    set selection(selection: Range | undefined) {
        this._selection = selection;
    }

    protected _cellheight: number = 0;
    get cellHeight(): number {
        return this._cellheight;
    }

    set cellHeight(height: number) {
        if (height !== this._cellheight) {
            this.onDidCellHeightChangeEmitter.fire(height);
            this._cellheight = height;
        }
    }

    @postConstruct()
    protected init(): void {
        this._outputs = this.props.outputs.map(op => new NotebookCellOutputModel(op));
        this._metadata = this.props.metadata ?? {};
        this._internalMetadata = this.props.internalMetadata ?? {};

        this.editorOptions = {
            lineNumbers: this.preferenceService.get(NotebookPreferences.NOTEBOOK_LINE_NUMBERS)
        };
        this.toDispose.push(this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === NotebookPreferences.NOTEBOOK_LINE_NUMBERS) {
                this.editorOptions = {
                    ...this.editorOptions,
                    lineNumbers: this.preferenceService.get(NotebookPreferences.NOTEBOOK_LINE_NUMBERS)
                };
            }
        }));
    }

    dispose(): void {
        this.onDidChangeOutputsEmitter.dispose();
        this.onDidChangeOutputItemsEmitter.dispose();
        this.onDidChangeContentEmitter.dispose();
        this.onDidChangeMetadataEmitter.dispose();
        this.onDidChangeInternalMetadataEmitter.dispose();
        this.onDidChangeLanguageEmitter.dispose();
        this.toDispose.dispose();
    }

    requestEdit(): void {
        if (!this.textModel || !this.textModel.readOnly) {
            this._editing = true;
            this.onDidRequestCellEditChangeEmitter.fire(true);
        }
    }

    requestStopEdit(): void {
        this._editing = false;
        this.onDidRequestCellEditChangeEmitter.fire(false);
    }

    requestFocusEditor(focusRequest?: CellEditorFocusRequest): void {
        this.requestEdit();
        this.onWillFocusCellEditorEmitter.fire(focusRequest);
    }

    requestBlurEditor(): void {
        this.requestStopEdit();
        this.onWillBlurCellEditorEmitter.fire();
    }

    requestCenterEditor(): void {
        this.onDidRequestCenterEditorEmitter.fire();
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

        const ref = await this.textModelService.getOrCreateNotebookCellModelReference(this.uri);
        this.textModel = ref.object;
        this.toDispose.push(ref);
        this.toDispose.push(this.textModel.onDidChangeContent(e => {
            this.props.source = e.model.getText();
        }));
        return ref.object;
    }

    restartOutputRenderer(outputId: string): void {
        const output = this.outputs.find(out => out.outputId === outputId);
        if (output) {
            this.onDidChangeOutputItemsEmitter.fire(output);
        }
    }

    onMarkdownFind: ((options: NotebookEditorFindMatchOptions) => NotebookEditorFindMatch[]) | undefined;

    showMatch(selected: NotebookCodeEditorFindMatch): void {
        this.onDidSelectFindMatchEmitter.fire(selected);
    }

    findMatches(options: NotebookEditorFindMatchOptions): NotebookEditorFindMatch[] {
        if (this.cellKind === CellKind.Markup && !this.editing) {
            return this.onMarkdownFind?.(options) ?? [];
        }
        if (!this.textModel) {
            return [];
        }
        const matches = options.search ? this.textModel.findMatches({
            searchString: options.search,
            isRegex: options.regex,
            matchCase: options.matchCase,
            matchWholeWord: options.wholeWord
        }) : [];
        const editorFindMatches = matches.map(match => new NotebookCodeEditorFindMatch(this, match.range, this.textModel!));
        this.onDidFindMatchesEmitter.fire(editorFindMatches);
        return editorFindMatches;
    }

    replaceAll(matches: NotebookCodeEditorFindMatch[], value: string): void {
        const editOperations = matches.map(match => ({
            range: {
                startColumn: match.range.start.character,
                startLineNumber: match.range.start.line,
                endColumn: match.range.end.character,
                endLineNumber: match.range.end.line
            },
            text: value
        }));
        this.textModel?.textEditorModel.pushEditOperations(
            // eslint-disable-next-line no-null/no-null
            null,
            editOperations,
            // eslint-disable-next-line no-null/no-null
            () => null);
    }
}

export interface NotebookCellFindMatches {
    matches: NotebookEditorFindMatch[];
    selected: NotebookEditorFindMatch;
}

export class NotebookCodeEditorFindMatch implements NotebookEditorFindMatch {

    selected = false;

    constructor(readonly cell: NotebookCellModel, readonly range: Range, readonly textModel: MonacoEditorModel) {
    }

    show(): void {
        this.cell.showMatch(this);
    }
    replace(value: string): void {
        this.textModel.textEditorModel.pushEditOperations(
            // eslint-disable-next-line no-null/no-null
            null,
            [{
                range: {
                    startColumn: this.range.start.character,
                    startLineNumber: this.range.start.line,
                    endColumn: this.range.end.character,
                    endLineNumber: this.range.end.line
                },
                text: value
            }],
            // eslint-disable-next-line no-null/no-null
            () => null);
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
