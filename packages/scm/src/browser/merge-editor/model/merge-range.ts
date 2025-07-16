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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange.ts

import { ArrayUtils } from '@theia/core';
import { uinteger, Position, Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { TextEditorDocument } from '@theia/editor/lib/browser/editor';
import { DetailedLineRangeMapping, MappingAlignment } from './range-mapping';
import { LineRange } from './line-range';
import { LineRangeEdit, RangeEdit } from './range-editing';
import { PositionUtils, RangeUtils } from './range-utils';

/**
 * Describes modifications in side 1 and side 2 for a specific range in base.
 */
export class MergeRange {

    static computeMergeRanges(
        side1Diff: readonly DetailedLineRangeMapping[],
        side2Diff: readonly DetailedLineRangeMapping[],
        baseDocument: TextEditorDocument,
        side1Document: TextEditorDocument,
        side2Document: TextEditorDocument
    ): MergeRange[] {
        const alignments = MappingAlignment.computeAlignments(side1Diff, side2Diff);
        return alignments.map(
            alignment => new MergeRange(
                alignment.baseRange,
                baseDocument,
                alignment.side1Range,
                alignment.side1Mappings,
                side1Document,
                alignment.side2Range,
                alignment.side2Mappings,
                side2Document
            )
        );
    }

    readonly side1CombinedChange = DetailedLineRangeMapping.join(this.side1Changes);
    readonly side2CombinedChange = DetailedLineRangeMapping.join(this.side2Changes);
    readonly isEqualChange = ArrayUtils.equals(this.side1Changes, this.side2Changes, (a, b) => a.getLineEdit().equals(b.getLineEdit()));

    constructor(
        readonly baseRange: LineRange,
        readonly baseDocument: TextEditorDocument,
        readonly side1Range: LineRange,
        readonly side1Changes: readonly DetailedLineRangeMapping[],
        readonly side1Document: TextEditorDocument,
        readonly side2Range: LineRange,
        readonly side2Changes: readonly DetailedLineRangeMapping[],
        readonly side2Document: TextEditorDocument
    ) {
        if (side1Changes.length === 0 && side2Changes.length === 0) {
            throw new Error('At least one change is expected');
        }
    }

    getModifiedRange(side: MergeSide): LineRange {
        return side === 1 ? this.side1Range : this.side2Range;
    }

    getCombinedChange(side: MergeSide): DetailedLineRangeMapping | undefined {
        return side === 1 ? this.side1CombinedChange : this.side2CombinedChange;
    }

    getChanges(side: MergeSide): readonly DetailedLineRangeMapping[] {
        return side === 1 ? this.side1Changes : this.side2Changes;
    }

    get isConflicting(): boolean {
        return this.side1Changes.length > 0 && this.side2Changes.length > 0 && !this.isEqualChange;
    }

    canBeSmartCombined(firstSide: MergeSide): boolean {
        return this.isConflicting && this.smartCombineChanges(firstSide) !== undefined;
    }

    get isSmartCombinationOrderRelevant(): boolean {
        const edit1 = this.smartCombineChanges(1);
        const edit2 = this.smartCombineChanges(2);
        if (!edit1 || !edit2) {
            return false;
        }
        return !edit1.equals(edit2);
    }

    getBaseRangeEdit(state: MergeRangeAcceptedState): LineRangeEdit {
        if (state === 'Base') {
            return new LineRangeEdit(this.baseRange, this.baseRange.getLines(this.baseDocument));
        }
        if (state === 'Side1') {
            return new LineRangeEdit(this.baseRange, this.side1Range.getLines(this.side1Document));
        }
        if (state === 'Side2') {
            return new LineRangeEdit(this.baseRange, this.side2Range.getLines(this.side2Document));
        }

        let edit: LineRangeEdit | undefined;
        const firstSide = state.startsWith('Side1') ? 1 : 2;
        if (state.endsWith('Smart')) {
            edit = this.smartCombineChanges(firstSide);
        }
        if (!edit) {
            edit = this.dumbCombineChanges(firstSide);
        }
        return edit;
    }

    protected smartCombinationEdit1?: { value: LineRangeEdit | undefined };
    protected smartCombinationEdit2?: { value: LineRangeEdit | undefined };

    protected smartCombineChanges(firstSide: MergeSide): LineRangeEdit | undefined {
        if (firstSide === 1 && this.smartCombinationEdit1) {
            return this.smartCombinationEdit1.value;
        } else if (firstSide === 2 && this.smartCombinationEdit2) {
            return this.smartCombinationEdit2.value;
        }

        const combinedChanges =
            this.side1Changes.flatMap(change => change.rangeMappings.map(rangeMapping => ({ rangeMapping, side: 1 }))).concat(
                this.side2Changes.flatMap(change => change.rangeMappings.map(rangeMapping => ({ rangeMapping, side: 2 })))).sort(
                    (a, b) => {
                        let result = RangeUtils.compareUsingStarts(a.rangeMapping.originalRange, b.rangeMapping.originalRange);
                        if (result === 0) {
                            const sideWeight = (side: number) => side === firstSide ? 1 : 2;
                            result = sideWeight(a.side) - sideWeight(b.side);
                        }
                        return result;
                    }
                );

        const sortedEdits = combinedChanges.map(change => {
            const modifiedDocument = change.side === 1 ? this.side1Document : this.side2Document;
            return new RangeEdit(change.rangeMapping.originalRange, modifiedDocument.getText(change.rangeMapping.modifiedRange));
        });

        const edit = this.editsToLineRangeEdit(this.baseRange, sortedEdits, this.baseDocument);
        if (firstSide === 1) {
            this.smartCombinationEdit1 = { value: edit };
        } else {
            this.smartCombinationEdit2 = { value: edit };
        }
        return edit;
    }

    protected editsToLineRangeEdit(range: LineRange, sortedEdits: RangeEdit[], document: TextEditorDocument): LineRangeEdit | undefined {
        let text = '';
        const startsLineBefore = range.startLineNumber > 0;
        let currentPosition = startsLineBefore
            ? Position.create(
                range.startLineNumber - 1,
                document.getLineMaxColumn((range.startLineNumber - 1) + 1) // note that getLineMaxColumn expects a 1-based line number
            )
            : Position.create(range.startLineNumber, 0);

        for (const edit of sortedEdits) {
            const diffStart = edit.range.start;
            if (!PositionUtils.isBeforeOrEqual(currentPosition, diffStart)) {
                return undefined;
            }
            let originalText = document.getText(Range.create(currentPosition, diffStart));
            if (diffStart.line >= document.lineCount) {
                // getText doesn't include this virtual line break, as the document ends the line before.
                // endsLineAfter will be false.
                originalText += '\n';
            }
            text += originalText;
            text += edit.newText;
            currentPosition = edit.range.end;
        }

        const endsLineAfter = range.endLineNumberExclusive < document.lineCount;
        const end = endsLineAfter ?
            Position.create(range.endLineNumberExclusive, 0) :
            Position.create(range.endLineNumberExclusive - 1, uinteger.MAX_VALUE);

        text += document.getText(Range.create(currentPosition, end));

        const lines = text.split(/\r\n|\r|\n/);
        if (startsLineBefore) {
            if (lines[0] !== '') {
                return undefined;
            }
            lines.shift();
        }
        if (endsLineAfter) {
            if (lines[lines.length - 1] !== '') {
                return undefined;
            }
            lines.pop();
        }
        return new LineRangeEdit(range, lines);
    }

    protected dumbCombinationEdit1?: LineRangeEdit;
    protected dumbCombinationEdit2?: LineRangeEdit;

    protected dumbCombineChanges(firstSide: MergeSide): LineRangeEdit {
        if (firstSide === 1 && this.dumbCombinationEdit1) {
            return this.dumbCombinationEdit1;
        } else if (firstSide === 2 && this.dumbCombinationEdit2) {
            return this.dumbCombinationEdit2;
        }

        const modifiedLines1 = this.side1Range.getLines(this.side1Document);
        const modifiedLines2 = this.side2Range.getLines(this.side2Document);
        const combinedLines = firstSide === 1 ? modifiedLines1.concat(modifiedLines2) : modifiedLines2.concat(modifiedLines1);

        const edit = new LineRangeEdit(this.baseRange, combinedLines);
        if (firstSide === 1) {
            this.dumbCombinationEdit1 = edit;
        } else {
            this.dumbCombinationEdit2 = edit;
        }
        return edit;
    }
}

export type MergeSide = 1 | 2;

export type MergeRangeAcceptedState = 'Base' | 'Side1' | 'Side2' | 'Side1Side2' | 'Side2Side1' | 'Side1Side2Smart' | 'Side2Side1Smart';

export namespace MergeRangeAcceptedState {

    export function addSide(state: MergeRangeAcceptedState, side: MergeSide, options?: { smartCombination?: boolean }): MergeRangeAcceptedState {
        if (state === 'Base') {
            return side === 1 ? 'Side1' : 'Side2';
        }
        if (state.includes('Side' + side)) {
            return state;
        }
        if (side === 2) {
            return options?.smartCombination ? 'Side1Side2Smart' : 'Side1Side2';
        } else {
            return options?.smartCombination ? 'Side2Side1Smart' : 'Side2Side1';
        }
    }

    export function removeSide(state: MergeRangeAcceptedState, side: MergeSide): MergeRangeAcceptedState {
        if (!state.includes('Side' + side)) {
            return state;
        }
        if (state === 'Side' + side) {
            return 'Base';
        }
        return side === 1 ? 'Side2' : 'Side1';
    }
}

export type MergeRangeResultState = MergeRangeAcceptedState | 'Unrecognized';
