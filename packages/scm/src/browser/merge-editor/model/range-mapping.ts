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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/model/mapping.ts

import { ArrayUtils } from '@theia/core';
import { Position, Range, TextEditorDocument } from '@theia/editor/lib/browser/editor';
import { LineRange } from './line-range';
import { LineRangeEdit } from './range-editing';
import { PositionUtils, RangeUtils } from './range-utils';

/**
 * Maps a line range in the original text document to a line range in the modified text document.
 */
export class LineRangeMapping {

    static join(mappings: readonly LineRangeMapping[]): LineRangeMapping | undefined {
        return mappings.reduce<undefined | LineRangeMapping>((acc, cur) => acc ? acc.join(cur) : cur, undefined);
    }

    constructor(
        readonly originalRange: LineRange,
        readonly modifiedRange: LineRange
    ) { }

    toString(): string {
        return `${this.originalRange.toString()} -> ${this.modifiedRange.toString()}`;
    }

    join(other: LineRangeMapping): LineRangeMapping {
        return new LineRangeMapping(
            this.originalRange.join(other.originalRange),
            this.modifiedRange.join(other.modifiedRange)
        );
    }

    addModifiedLineDelta(delta: number): LineRangeMapping {
        return new LineRangeMapping(
            this.originalRange,
            this.modifiedRange.delta(delta)
        );
    }

    addOriginalLineDelta(delta: number): LineRangeMapping {
        return new LineRangeMapping(
            this.originalRange.delta(delta),
            this.modifiedRange
        );
    }

    reverse(): LineRangeMapping {
        return new LineRangeMapping(this.modifiedRange, this.originalRange);
    }
}

/**
 * Represents a total monotonous mapping of line ranges in one document to another document.
 */
export class DocumentLineRangeMap {

    static betweenModifiedSides(
        side1Diff: readonly LineRangeMapping[],
        side2Diff: readonly LineRangeMapping[]
    ): DocumentLineRangeMap {
        const alignments = MappingAlignment.computeAlignments(side1Diff, side2Diff);
        const mappings = alignments.map(alignment => new LineRangeMapping(alignment.side1Range, alignment.side2Range));
        return new DocumentLineRangeMap(mappings);
    }

    constructor(
        /**
         * The line range mappings that define this document mapping.
         * The number of lines between two adjacent original ranges must equal the number of lines between their corresponding modified ranges.
         */
        readonly lineRangeMappings: readonly LineRangeMapping[]
    ) {
        if (!ArrayUtils.checkAdjacentItems(lineRangeMappings,
            (m1, m2) => m1.originalRange.isBefore(m2.originalRange) && m1.modifiedRange.isBefore(m2.modifiedRange) &&
                m2.originalRange.startLineNumber - m1.originalRange.endLineNumberExclusive === m2.modifiedRange.startLineNumber - m1.modifiedRange.endLineNumberExclusive
        )) {
            throw new Error('Illegal line range mappings');
        }
    }

    /**
     * @param lineNumber 0-based line number in the original text document
     */
    projectLine(lineNumber: number): LineRangeMapping {
        const lastBefore = ArrayUtils.findLast(this.lineRangeMappings, m => m.originalRange.startLineNumber <= lineNumber);
        if (!lastBefore) {
            return new LineRangeMapping(
                new LineRange(lineNumber, 1),
                new LineRange(lineNumber, 1)
            );
        }

        if (lastBefore.originalRange.containsLine(lineNumber)) {
            return lastBefore;
        }

        return new LineRangeMapping(
            new LineRange(lineNumber, 1),
            new LineRange(lineNumber + lastBefore.modifiedRange.endLineNumberExclusive - lastBefore.originalRange.endLineNumberExclusive, 1)
        );
    }

    reverse(): DocumentLineRangeMap {
        return new DocumentLineRangeMap(
            this.lineRangeMappings.map(m => m.reverse())
        );
    }
}

/**
 * Aligns mappings for two modified sides with a common base range.
 */
export class MappingAlignment<T extends LineRangeMapping> {

    static computeAlignments<T extends LineRangeMapping>(
        side1Mappings: readonly T[],
        side2Mappings: readonly T[]
    ): MappingAlignment<T>[] {
        const combinedMappings =
            side1Mappings.map(mapping => ({ source: 0, mapping })).concat(
                side2Mappings.map(mapping => ({ source: 1, mapping }))).sort(
                    (a, b) => LineRange.compareByStart(a.mapping.originalRange, b.mapping.originalRange));

        const currentMappings = [new Array<T>(), new Array<T>()];
        const currentDelta = [0, 0];

        const alignments = new Array<MappingAlignment<T>>();

        function pushAlignment(baseRange: LineRange): void {
            const mapping1 = LineRangeMapping.join(currentMappings[0]) || new LineRangeMapping(baseRange, baseRange.delta(currentDelta[0]));
            const mapping2 = LineRangeMapping.join(currentMappings[1]) || new LineRangeMapping(baseRange, baseRange.delta(currentDelta[1]));

            function getAlignedModifiedRange(m: LineRangeMapping): LineRange {
                const startDelta = baseRange.startLineNumber - m.originalRange.startLineNumber;
                const endDelta = baseRange.endLineNumberExclusive - m.originalRange.endLineNumberExclusive;
                return new LineRange(
                    m.modifiedRange.startLineNumber + startDelta,
                    m.modifiedRange.lineCount - startDelta + endDelta
                );
            }

            alignments.push(
                new MappingAlignment(
                    baseRange,
                    getAlignedModifiedRange(mapping1),
                    currentMappings[0],
                    getAlignedModifiedRange(mapping2),
                    currentMappings[1]
                )
            );
            currentMappings[0] = [];
            currentMappings[1] = [];
        }

        let currentBaseRange: LineRange | undefined;

        for (const current of combinedMappings) {
            const { originalRange, modifiedRange } = current.mapping;
            if (currentBaseRange && !currentBaseRange.touches(originalRange)) {
                pushAlignment(currentBaseRange);
                currentBaseRange = undefined;
            }
            currentBaseRange = currentBaseRange ? currentBaseRange.join(originalRange) : originalRange;
            currentMappings[current.source].push(current.mapping);
            currentDelta[current.source] = modifiedRange.endLineNumberExclusive - originalRange.endLineNumberExclusive;
        }
        if (currentBaseRange) {
            pushAlignment(currentBaseRange);
        }

        return alignments;
    }

    constructor(
        readonly baseRange: LineRange,
        readonly side1Range: LineRange,
        readonly side1Mappings: readonly T[],
        readonly side2Range: LineRange,
        readonly side2Mappings: readonly T[]
    ) { }

    toString(): string {
        return `${this.side1Range} <- ${this.baseRange} -> ${this.side2Range}`;
    }
}

/**
 * A line range mapping with inner range mappings.
 */
export class DetailedLineRangeMapping extends LineRangeMapping {

    static override join(mappings: readonly DetailedLineRangeMapping[]): DetailedLineRangeMapping | undefined {
        return mappings.reduce<undefined | DetailedLineRangeMapping>((acc, cur) => acc ? acc.join(cur) : cur, undefined);
    }

    readonly rangeMappings: readonly RangeMapping[];

    constructor(
        originalRange: LineRange,
        readonly originalDocument: TextEditorDocument,
        modifiedRange: LineRange,
        readonly modifiedDocument: TextEditorDocument,
        rangeMappings?: readonly RangeMapping[]
    ) {
        super(originalRange, modifiedRange);

        this.rangeMappings = rangeMappings || [new RangeMapping(originalRange.toRange(), modifiedRange.toRange())];
    }

    override join(other: DetailedLineRangeMapping): DetailedLineRangeMapping {
        return new DetailedLineRangeMapping(
            this.originalRange.join(other.originalRange),
            this.originalDocument,
            this.modifiedRange.join(other.modifiedRange),
            this.modifiedDocument
        );
    }

    override addModifiedLineDelta(delta: number): DetailedLineRangeMapping {
        return new DetailedLineRangeMapping(
            this.originalRange,
            this.originalDocument,
            this.modifiedRange.delta(delta),
            this.modifiedDocument,
            this.rangeMappings.map(m => m.addModifiedLineDelta(delta))
        );
    }

    override addOriginalLineDelta(delta: number): DetailedLineRangeMapping {
        return new DetailedLineRangeMapping(
            this.originalRange.delta(delta),
            this.originalDocument,
            this.modifiedRange,
            this.modifiedDocument,
            this.rangeMappings.map(m => m.addOriginalLineDelta(delta))
        );
    }

    override reverse(): DetailedLineRangeMapping {
        return new DetailedLineRangeMapping(
            this.modifiedRange,
            this.modifiedDocument,
            this.originalRange,
            this.originalDocument,
            this.rangeMappings.map(m => m.reverse())
        );
    }

    getLineEdit(): LineRangeEdit {
        return new LineRangeEdit(this.originalRange, this.getModifiedLines());
    }

    getReverseLineEdit(): LineRangeEdit {
        return new LineRangeEdit(this.modifiedRange, this.getOriginalLines());
    }

    getModifiedLines(): string[] {
        return this.modifiedRange.getLines(this.modifiedDocument);
    }

    getOriginalLines(): string[] {
        return this.originalRange.getLines(this.originalDocument);
    }
}

/**
 * Maps a range in the original text document to a range in the modified text document.
 */
export class RangeMapping {

    constructor(
        readonly originalRange: Readonly<Range>,
        readonly modifiedRange: Readonly<Range>
    ) { }

    toString(): string {
        function rangeToString(range: Range): string {
            return `[${range.start.line}:${range.start.character}, ${range.end.line}:${range.end.character})`;
        }

        return `${rangeToString(this.originalRange)} -> ${rangeToString(this.modifiedRange)}`;
    }

    addModifiedLineDelta(deltaLines: number): RangeMapping {
        return new RangeMapping(
            this.originalRange,
            Range.create(
                this.modifiedRange.start.line + deltaLines,
                this.modifiedRange.start.character,
                this.modifiedRange.end.line + deltaLines,
                this.modifiedRange.end.character
            )
        );
    }

    addOriginalLineDelta(deltaLines: number): RangeMapping {
        return new RangeMapping(
            Range.create(
                this.originalRange.start.line + deltaLines,
                this.originalRange.start.character,
                this.originalRange.end.line + deltaLines,
                this.originalRange.end.character
            ),
            this.modifiedRange
        );
    }

    reverse(): RangeMapping {
        return new RangeMapping(this.modifiedRange, this.originalRange);
    }
}

/**
 * Represents a total monotonous mapping of ranges in one document to another document.
 */
export class DocumentRangeMap {

    constructor(
        /**
         * The range mappings that define this document mapping.
         */
        readonly rangeMappings: readonly RangeMapping[]
    ) {
        if (!ArrayUtils.checkAdjacentItems(
            rangeMappings,
            (m1, m2) =>
                RangeUtils.isBeforeOrTouching(m1.originalRange, m2.originalRange) &&
                RangeUtils.isBeforeOrTouching(m1.modifiedRange, m2.modifiedRange)
        )) {
            throw new Error('Illegal range mappings');
        }
    }

    /**
     * @param position position in the original text document
     */
    projectPosition(position: Position): RangeMapping {
        const lastBefore = ArrayUtils.findLast(this.rangeMappings, m => PositionUtils.isBeforeOrEqual(m.originalRange.start, position));
        if (!lastBefore) {
            return new RangeMapping(
                Range.create(position, position),
                Range.create(position, position)
            );
        }

        if (RangeUtils.containsPosition(lastBefore.originalRange, position)) {
            return lastBefore;
        }

        const relativePosition = PositionUtils.relativize(lastBefore.originalRange.end, position);
        const modifiedRangePosition = PositionUtils.resolve(lastBefore.modifiedRange.end, relativePosition);

        return new RangeMapping(
            Range.create(position, position),
            Range.create(modifiedRangePosition, modifiedRangePosition)
        );
    }

    /**
     * @param range range in the original text document
     */
    projectRange(range: Range): RangeMapping {
        const start = this.projectPosition(range.start);
        const end = this.projectPosition(range.end);
        return new RangeMapping(
            RangeUtils.union(start.originalRange, end.originalRange),
            RangeUtils.union(start.modifiedRange, end.modifiedRange)
        );
    }

    reverse(): DocumentRangeMap {
        return new DocumentRangeMap(
            this.rangeMappings.map(m => m.reverse())
        );
    }
}
