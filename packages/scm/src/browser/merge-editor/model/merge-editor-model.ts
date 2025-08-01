// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel.ts,
// https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/view/viewModel.ts

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ArrayUtils, Disposable, DisposableCollection } from '@theia/core';
import { Autorun, DerivedObservable, Observable, ObservableUtils, SettableObservable } from '@theia/core/lib/common/observable';
import { DiffComputer } from '@theia/core/lib/common/diff';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoToProtocolConverter } from '@theia/monaco/lib/browser/monaco-to-protocol-converter';
import { MergeRange, MergeRangeAcceptedState, MergeRangeResultState, MergeSide } from './merge-range';
import { DetailedLineRangeMapping, DocumentLineRangeMap, DocumentRangeMap, LineRangeMapping, RangeMapping } from './range-mapping';
import { LiveDiff, LiveDiffState } from './live-diff';
import { LineRange } from './line-range';
import { LineRangeEdit } from './range-editing';

export const MergeEditorModelProps = Symbol('MergeEditorModelProps');
export interface MergeEditorModelProps {
    readonly baseEditor: MonacoEditor;
    readonly side1Editor: MonacoEditor;
    readonly side2Editor: MonacoEditor;
    readonly resultEditor: MonacoEditor;
    readonly options?: {
        readonly resetResult?: boolean;
    }
}

@injectable()
export class MergeEditorModel implements Disposable {

    @inject(MergeEditorModelProps)
    protected readonly props: MergeEditorModelProps;

    @inject(DiffComputer)
    protected readonly diffComputer: DiffComputer;

    @inject(MonacoToProtocolConverter)
    private readonly m2p: MonacoToProtocolConverter;

    protected readonly toDispose = new DisposableCollection();

    protected side1LiveDiff: LiveDiff;
    protected side2LiveDiff: LiveDiff;
    protected resultLiveDiff: LiveDiff;

    protected shouldRecomputeHandledState = true;

    protected readonly mergeRangesObservable = DerivedObservable.create(() => this.computeMergeRanges());
    get mergeRanges(): readonly MergeRange[] {
        return this.mergeRangesObservable.get();
    }

    protected readonly mergeRangesDataObservable = DerivedObservable.create(() => new Map(
        this.mergeRanges.map(mergeRange => [mergeRange, this.newMergeRangeData()])
    ));

    // #region Line Range Mapping
    protected readonly side1ToResultLineRangeMapObservable = DerivedObservable.create(() => this.newDocumentLineRangeMap(
        this.computeSideToResultDiff(this.side1Changes, this.resultChanges)
    ));
    get side1ToResultLineRangeMap(): DocumentLineRangeMap {
        return this.side1ToResultLineRangeMapObservable.get();
    }

    protected readonly resultToSide1LineRangeMapObservable = DerivedObservable.create(() => this.side1ToResultLineRangeMap.reverse());
    get resultToSide1LineRangeMap(): DocumentLineRangeMap {
        return this.resultToSide1LineRangeMapObservable.get();
    }

    protected readonly side2ToResultLineRangeMapObservable = DerivedObservable.create(() => this.newDocumentLineRangeMap(
        this.computeSideToResultDiff(this.side2Changes, this.resultChanges)
    ));
    get side2ToResultLineRangeMap(): DocumentLineRangeMap {
        return this.side2ToResultLineRangeMapObservable.get();
    }

    protected readonly resultToSide2LineRangeMapObservable = DerivedObservable.create(() => this.side2ToResultLineRangeMap.reverse());
    get resultToSide2LineRangeMap(): DocumentLineRangeMap {
        return this.resultToSide2LineRangeMapObservable.get();
    }

    protected readonly baseToSide1LineRangeMapObservable = DerivedObservable.create(() => this.newDocumentLineRangeMap(this.side1Changes));
    get baseToSide1LineRangeMap(): DocumentLineRangeMap {
        return this.baseToSide1LineRangeMapObservable.get();
    }

    protected readonly side1ToBaseLineRangeMapObservable = DerivedObservable.create(() => this.baseToSide1LineRangeMap.reverse());
    get side1ToBaseLineRangeMap(): DocumentLineRangeMap {
        return this.side1ToBaseLineRangeMapObservable.get();
    }

    protected readonly baseToSide2LineRangeMapObservable = DerivedObservable.create(() => this.newDocumentLineRangeMap(this.side2Changes));
    get baseToSide2LineRangeMap(): DocumentLineRangeMap {
        return this.baseToSide2LineRangeMapObservable.get();
    }

    protected readonly side2ToBaseLineRangeMapObservable = DerivedObservable.create(() => this.baseToSide2LineRangeMap.reverse());
    get side2ToBaseLineRangeMap(): DocumentLineRangeMap {
        return this.side2ToBaseLineRangeMapObservable.get();
    }

    protected readonly baseToResultLineRangeMapObservable = DerivedObservable.create(() => this.newDocumentLineRangeMap(this.resultChanges));
    get baseToResultLineRangeMap(): DocumentLineRangeMap {
        return this.baseToResultLineRangeMapObservable.get();
    }

    protected readonly resultToBaseLineRangeMapObservable = DerivedObservable.create(() => this.baseToResultLineRangeMap.reverse());
    get resultToBaseLineRangeMap(): DocumentLineRangeMap {
        return this.resultToBaseLineRangeMapObservable.get();
    }
    // #endregion

    // #region Range Mapping
    protected readonly baseToSide1RangeMapObservable = DerivedObservable.create(() => this.newDocumentRangeMap(
        this.side1Changes.flatMap(change => change.rangeMappings)
    ));
    get baseToSide1RangeMap(): DocumentRangeMap {
        return this.baseToSide1RangeMapObservable.get();
    }

    protected readonly side1ToBaseRangeMapObservable = DerivedObservable.create(() => this.baseToSide1RangeMap.reverse());
    get side1ToBaseRangeMap(): DocumentRangeMap {
        return this.side1ToBaseRangeMapObservable.get();
    }

    protected readonly baseToSide2RangeMapObservable = DerivedObservable.create(() => this.newDocumentRangeMap(
        this.side2Changes.flatMap(change => change.rangeMappings)
    ));
    get baseToSide2RangeMap(): DocumentRangeMap {
        return this.baseToSide2RangeMapObservable.get();
    }

    protected readonly side2ToBaseRangeMapObservable = DerivedObservable.create(() => this.baseToSide2RangeMap.reverse());
    get side2ToBaseRangeMap(): DocumentRangeMap {
        return this.side2ToBaseRangeMapObservable.get();
    }

    protected readonly baseToResultRangeMapObservable = DerivedObservable.create(() => this.newDocumentRangeMap(
        this.resultChanges.flatMap(change => change.rangeMappings)
    ));
    get baseToResultRangeMap(): DocumentRangeMap {
        return this.baseToResultRangeMapObservable.get();
    }

    protected readonly resultToBaseRangeMapObservable = DerivedObservable.create(() => this.baseToResultRangeMap.reverse());
    get resultToBaseRangeMap(): DocumentRangeMap {
        return this.resultToBaseRangeMapObservable.get();
    }
    // #endregion

    protected readonly diffComputingStateObservable = DerivedObservable.create(() => this.getDiffComputingState(this.side1LiveDiff, this.side2LiveDiff, this.resultLiveDiff));
    protected readonly diffComputingStateForSidesObservable = DerivedObservable.create(() => this.getDiffComputingState(this.side1LiveDiff, this.side2LiveDiff));

    readonly isUpToDateObservable = DerivedObservable.create(() => this.diffComputingStateObservable.get() === DiffComputingState.UpToDate);

    protected readonly unhandledMergeRangesCountObservable = DerivedObservable.create(() => {
        let result = 0;
        const mergeRangesData = this.mergeRangesDataObservable.get();
        for (const mergeRangeData of mergeRangesData.values()) {
            if (!mergeRangeData.isHandledObservable.get()) {
                result++;
            }
        }
        return result;
    });
    get unhandledMergeRangesCount(): number {
        return this.unhandledMergeRangesCountObservable.get();
    }

    protected _onInitialized: Promise<void>;
    get onInitialized(): Promise<void> {
        return this._onInitialized;
    }

    get baseDocument(): MonacoEditorModel {
        return this.props.baseEditor.document;
    }

    get side1Document(): MonacoEditorModel {
        return this.props.side1Editor.document;
    }

    get side2Document(): MonacoEditorModel {
        return this.props.side2Editor.document;
    }

    get resultDocument(): MonacoEditorModel {
        return this.props.resultEditor.document;
    }

    protected get resultEditor(): MonacoEditor {
        return this.props.resultEditor;
    }

    get side1Changes(): readonly DetailedLineRangeMapping[] {
        return this.side1LiveDiff.changes;
    }

    get side2Changes(): readonly DetailedLineRangeMapping[] {
        return this.side2LiveDiff.changes;
    }

    get resultChanges(): readonly DetailedLineRangeMapping[] {
        return this.resultLiveDiff.changes;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.side1LiveDiff = this.newLiveDiff(this.baseDocument, this.side1Document));
        this.toDispose.push(this.side2LiveDiff = this.newLiveDiff(this.baseDocument, this.side2Document));
        this.toDispose.push(this.resultLiveDiff = this.newLiveDiff(this.baseDocument, this.resultDocument));

        this.toDispose.push(Observable.keepObserved(this.mergeRangesDataObservable));

        this.toDispose.push(Observable.keepObserved(this.side1ToResultLineRangeMapObservable));
        this.toDispose.push(Observable.keepObserved(this.resultToSide1LineRangeMapObservable));

        this.toDispose.push(Observable.keepObserved(this.side2ToResultLineRangeMapObservable));
        this.toDispose.push(Observable.keepObserved(this.resultToSide2LineRangeMapObservable));

        this.toDispose.push(Observable.keepObserved(this.baseToSide1LineRangeMapObservable));
        this.toDispose.push(Observable.keepObserved(this.side1ToBaseLineRangeMapObservable));

        this.toDispose.push(Observable.keepObserved(this.baseToSide2LineRangeMapObservable));
        this.toDispose.push(Observable.keepObserved(this.side2ToBaseLineRangeMapObservable));

        this.toDispose.push(Observable.keepObserved(this.baseToResultLineRangeMapObservable));
        this.toDispose.push(Observable.keepObserved(this.resultToBaseLineRangeMapObservable));

        this.toDispose.push(Observable.keepObserved(this.baseToSide1RangeMapObservable));
        this.toDispose.push(Observable.keepObserved(this.side1ToBaseRangeMapObservable));

        this.toDispose.push(Observable.keepObserved(this.baseToSide2RangeMapObservable));
        this.toDispose.push(Observable.keepObserved(this.side2ToBaseRangeMapObservable));

        this.toDispose.push(Observable.keepObserved(this.baseToResultRangeMapObservable));
        this.toDispose.push(Observable.keepObserved(this.resultToBaseRangeMapObservable));

        const initializePromise = this.doInit();

        this._onInitialized = ObservableUtils.waitForState(this.isUpToDateObservable).then(() => initializePromise);

        initializePromise.then(() => {
            this.toDispose.push(Autorun.create(() => {
                if (!this.isUpToDateObservable.get()) {
                    return;
                }
                Observable.update(() => {
                    const mergeRangesData = this.mergeRangesDataObservable.get();

                    for (const [mergeRange, mergeRangeData] of mergeRangesData) {
                        const state = this.computeMergeRangeStateFromResult(mergeRange);
                        mergeRangeData.resultStateObservable.set(state);
                        if (this.shouldRecomputeHandledState) {
                            mergeRangeData.isHandledObservable.set(state !== 'Base');
                        }
                    }

                    this.shouldRecomputeHandledState = false;
                });
            }, {
                willHandleChange: ctx => {
                    if (ctx.isChangeOf(this.mergeRangesDataObservable)) {
                        this.shouldRecomputeHandledState = true;
                    }
                    return true;
                }
            }));

            const attachedHistory = new AttachedHistory(this.resultDocument);
            this.toDispose.push(attachedHistory);
            this.toDispose.push(this.resultDocument.textEditorModel.onDidChangeContent(event => {
                if (event.isRedoing || event.isUndoing) {
                    return;
                }

                // Mark merge ranges affected by content changes as handled.
                const mergeRanges: MergeRange[] = [];

                for (const change of event.changes) {
                    const { start, end } = this.translateResultRangeToBase(this.m2p.asRange(change.range));
                    const affectedMergeRanges = this.findMergeRanges(new LineRange(start.line, end.line - start.line));
                    for (const mergeRange of affectedMergeRanges) {
                        if (!this.isMergeRangeHandled(mergeRange)) {
                            mergeRanges.push(mergeRange);
                        }
                    }
                }

                if (mergeRanges.length === 0) {
                    return;
                }

                const markMergeRangesAsHandled = (handled: boolean) => {
                    Observable.update(() => {
                        const mergeRangesData = this.mergeRangesDataObservable.get();
                        for (const mergeRange of mergeRanges) {
                            const mergeRangeData = mergeRangesData.get(mergeRange);
                            if (mergeRangeData) {
                                mergeRangeData.isHandledObservable.set(handled);
                            }
                        }
                    });
                };
                const element: IAttachedHistoryElement = {
                    redo: () => {
                        markMergeRangesAsHandled(true);
                    },
                    undo: () => {
                        markMergeRangesAsHandled(false);
                    }
                };
                attachedHistory.pushAttachedHistoryElement(element);
                element.redo();
            }));
        });
    }

    protected computeMergeRangeStateFromResult(mergeRange: MergeRange): MergeRangeResultState {

        const resultRange = this.getLineRangeInResult(mergeRange);
        const existingLines = resultRange.getLines(this.resultDocument);

        const states: MergeRangeAcceptedState[] = [
            'Base',
            'Side1',
            'Side2',
            'Side1Side2Smart',
            'Side2Side1Smart',
            'Side1Side2',
            'Side2Side1'
        ];

        for (const state of states) {
            const edit = mergeRange.getBaseRangeEdit(state);
            if (ArrayUtils.equals(edit.newLines, existingLines)) {
                return state;
            }
        }

        return 'Unrecognized';
    }

    protected async doInit(): Promise<void> {
        if (this.props.options?.resetResult) {
            await this.reset();
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    isDisposed(): boolean {
        return this.toDispose.disposed;
    }

    async reset(): Promise<void> {
        await ObservableUtils.waitForState(this.diffComputingStateForSidesObservable, state => state === DiffComputingState.UpToDate);

        this.shouldRecomputeHandledState = true;
        this.resultDocument.textEditorModel.setValue(this.computeAutoMergedResult());
    }

    protected computeAutoMergedResult(): string {
        const baseLines = this.baseDocument.textEditorModel.getLinesContent();
        const side1Lines = this.side1Document.textEditorModel.getLinesContent();
        const side2Lines = this.side2Document.textEditorModel.getLinesContent();

        const resultLines: string[] = [];

        function appendLinesToResult(documentLines: string[], lineRange: LineRange): void {
            for (let i = lineRange.startLineNumber; i < lineRange.endLineNumberExclusive; i++) {
                resultLines.push(documentLines[i]);
            }
        }

        let baseStartLineNumber = 0;

        for (const mergeRange of this.mergeRanges) {
            appendLinesToResult(baseLines, LineRange.fromLineNumbers(baseStartLineNumber, mergeRange.baseRange.startLineNumber));

            if (mergeRange.side1Changes.length === 0) {
                appendLinesToResult(side2Lines, mergeRange.side2Range);
            } else if (mergeRange.side2Changes.length === 0) {
                appendLinesToResult(side1Lines, mergeRange.side1Range);
            } else if (mergeRange.isEqualChange) {
                appendLinesToResult(side1Lines, mergeRange.side1Range);
            } else {
                appendLinesToResult(baseLines, mergeRange.baseRange);
            }

            baseStartLineNumber = mergeRange.baseRange.endLineNumberExclusive;
        }

        appendLinesToResult(baseLines, LineRange.fromLineNumbers(baseStartLineNumber, baseLines.length));

        return resultLines.join(this.resultDocument.textEditorModel.getEOL());
    }

    protected computeMergeRanges(): MergeRange[] {
        return MergeRange.computeMergeRanges(this.side1Changes, this.side2Changes, this.baseDocument, this.side1Document, this.side2Document);
    }

    hasMergeRange(mergeRange: MergeRange): boolean {
        return this.mergeRangesDataObservable.get().has(mergeRange);
    }

    protected getMergeRangeData(mergeRange: MergeRange): MergeRangeData {
        const mergeRangeData = this.mergeRangesDataObservable.get().get(mergeRange);
        if (!mergeRangeData) {
            throw new Error('Unknown merge range');
        }
        return mergeRangeData;
    }

    getMergeRangeResultState(mergeRange: MergeRange): MergeRangeResultState {
        return this.getMergeRangeData(mergeRange).resultStateObservable.get();
    }

    applyMergeRangeAcceptedState(mergeRange: MergeRange, state: MergeRangeAcceptedState): void {
        if (!this.isUpToDateObservable.get()) {
            throw new Error('Cannot apply merge range accepted state while updating');
        }
        if (state !== 'Base' && this.getMergeRangeResultState(mergeRange) === 'Unrecognized') {
            throw new Error('Cannot apply merge range accepted state to an unrecognized result state');
        }

        const { originalRange: baseRange, modifiedRange: resultRange } = this.getResultLineRangeMapping(mergeRange);
        let newLines: string[];
        if (state === 'Base') {
            newLines = baseRange.getLines(this.baseDocument);
        } else {
            if (!baseRange.equals(mergeRange.baseRange)) {
                throw new Error('Assertion error');
            }
            newLines = mergeRange.getBaseRangeEdit(state).newLines;
        }
        const resultEdit = new LineRangeEdit(resultRange, newLines);
        const editOperation = resultEdit.toRangeEdit(this.resultDocument.lineCount).toMonacoEdit();

        const cursorState = this.resultEditor.getControl().getSelections();
        this.resultDocument.textEditorModel.pushStackElement();
        this.resultDocument.textEditorModel.pushEditOperations(cursorState, [editOperation], () => cursorState);
        this.resultDocument.textEditorModel.pushStackElement();
    }

    isMergeRangeHandled(mergeRange: MergeRange): boolean {
        return this.getMergeRangeData(mergeRange).isHandledObservable.get();
    }

    getLineRangeInResult(mergeRange: MergeRange): LineRange {
        return this.getResultLineRangeMapping(mergeRange).modifiedRange;
    }

    protected getResultLineRangeMapping(mergeRange: MergeRange): LineRangeMapping {
        const projectLine = (lineNumber: number): number | LineRangeMapping => {
            let offset = 0;
            const changes = this.resultChanges;
            for (const change of changes) {
                const { originalRange } = change;
                if (originalRange.containsLine(lineNumber) || originalRange.endLineNumberExclusive === lineNumber) {
                    return change;
                } else if (originalRange.endLineNumberExclusive < lineNumber) {
                    offset = change.modifiedRange.endLineNumberExclusive - originalRange.endLineNumberExclusive;
                } else {
                    break;
                }
            }
            return lineNumber + offset;
        };
        let startBase = mergeRange.baseRange.startLineNumber;
        let startResult = projectLine(startBase);
        if (typeof startResult !== 'number') {
            startBase = startResult.originalRange.startLineNumber;
            startResult = startResult.modifiedRange.startLineNumber;
        }
        let endExclusiveBase = mergeRange.baseRange.endLineNumberExclusive;
        let endExclusiveResult = projectLine(endExclusiveBase);
        if (typeof endExclusiveResult !== 'number') {
            endExclusiveBase = endExclusiveResult.originalRange.endLineNumberExclusive;
            endExclusiveResult = endExclusiveResult.modifiedRange.endLineNumberExclusive;
        }
        return new LineRangeMapping(LineRange.fromLineNumbers(startBase, endExclusiveBase), LineRange.fromLineNumbers(startResult, endExclusiveResult));
    }

    translateBaseRangeToSide(range: Range, side: MergeSide): Range {
        const rangeMap = side === 1 ? this.baseToSide1RangeMap : this.baseToSide2RangeMap;
        return rangeMap.projectRange(range).modifiedRange;
    }

    translateSideRangeToBase(range: Range, side: MergeSide): Range {
        const rangeMap = side === 1 ? this.side1ToBaseRangeMap : this.side2ToBaseRangeMap;
        return rangeMap.projectRange(range).modifiedRange;
    }

    translateBaseRangeToResult(range: Range): Range {
        return this.baseToResultRangeMap.projectRange(range).modifiedRange;
    }

    translateResultRangeToBase(range: Range): Range {
        return this.resultToBaseRangeMap.projectRange(range).modifiedRange;
    }

    findMergeRanges(baseRange: LineRange): MergeRange[] {
        return this.mergeRanges.filter(mergeRange => mergeRange.baseRange.touches(baseRange));
    }

    protected computeSideToResultDiff(sideChanges: readonly LineRangeMapping[], resultChanges: readonly LineRangeMapping[]): readonly LineRangeMapping[] {
        return DocumentLineRangeMap.betweenModifiedSides(sideChanges, resultChanges).lineRangeMappings;
    }

    protected newMergeRangeData(): MergeRangeData {
        return new MergeRangeData();
    }

    protected newLiveDiff(originalDocument: MonacoEditorModel, modifiedDocument: MonacoEditorModel): LiveDiff {
        return new LiveDiff(originalDocument, modifiedDocument, this.diffComputer);
    }

    protected newDocumentLineRangeMap(lineRangeMappings: readonly LineRangeMapping[]): DocumentLineRangeMap {
        return new DocumentLineRangeMap(lineRangeMappings);
    }

    protected newDocumentRangeMap(rangeMappings: readonly RangeMapping[]): DocumentRangeMap {
        return new DocumentRangeMap(rangeMappings);
    }

    protected getDiffComputingState(...liveDiffs: LiveDiff[]): DiffComputingState {
        const liveDiffStates = liveDiffs.map(liveDiff => liveDiff.state);

        if (liveDiffStates.some(state => state === LiveDiffState.Initializing)) {
            return DiffComputingState.Initializing;
        }

        if (liveDiffStates.some(state => state === LiveDiffState.Updating)) {
            return DiffComputingState.Updating;
        }

        return DiffComputingState.UpToDate;
    }
}

export const enum DiffComputingState {
    Initializing,
    UpToDate,
    Updating
}

export class MergeRangeData {
    readonly resultStateObservable = SettableObservable.create<MergeRangeResultState>('Base');
    readonly isHandledObservable = SettableObservable.create(false);
}

class AttachedHistory implements Disposable {
    private readonly toDispose = new DisposableCollection();
    private readonly attachedHistory: { element: IAttachedHistoryElement; altId: number }[] = [];

    constructor(private readonly model: MonacoEditorModel) {
        let previousAltId = this.model.textEditorModel.getAlternativeVersionId();
        this.toDispose.push(model.textEditorModel.onDidChangeContent(event => {
            const currentAltId = model.textEditorModel.getAlternativeVersionId();

            if (event.isRedoing) {
                for (const item of this.attachedHistory) {
                    if (previousAltId < item.altId && item.altId <= currentAltId) {
                        item.element.redo();
                    }
                }
            } else if (event.isUndoing) {
                for (let i = this.attachedHistory.length - 1; i >= 0; i--) {
                    const item = this.attachedHistory[i];
                    if (currentAltId < item.altId && item.altId <= previousAltId) {
                        item.element.undo();
                    }
                }
            } else {
                // The user destroyed the redo stack by performing a non redo/undo operation.
                while (
                    this.attachedHistory.length > 0
                    && this.attachedHistory[this.attachedHistory.length - 1].altId > previousAltId
                ) {
                    this.attachedHistory.pop();
                }
            }

            previousAltId = currentAltId;
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    pushAttachedHistoryElement(element: IAttachedHistoryElement): void {
        this.attachedHistory.push({ altId: this.model.textEditorModel.getAlternativeVersionId(), element });
    }
}

interface IAttachedHistoryElement {
    undo(): void;
    redo(): void;
}
