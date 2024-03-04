// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import * as jsdiff from 'diff';
import { ContentLinesArrayLike } from './content-lines';
import { Position } from '@theia/core/shared/vscode-languageserver-protocol';

export class DiffComputer {

    computeDiff(previous: ContentLinesArrayLike, current: ContentLinesArrayLike): DiffResult[] {
        const diffResult = diffArrays(previous, current);
        return diffResult;
    }

    computeDirtyDiff(previous: ContentLinesArrayLike, current: ContentLinesArrayLike, options?: DirtyDiffOptions): DirtyDiff {
        const added: LineRange[] = [];
        const removed: number[] = [];
        const modified: LineRange[] = [];
        const rangeMappings: RangeMapping[] | undefined = options?.rangeMappings ? [] : undefined;
        const changes = this.computeDiff(previous, current);
        let currentRevisionLine = -1;
        let previousRevisionLine = -1;
        for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            const next = changes[i + 1];
            if (change.added) {
                // case: addition
                const currentRange = toLineRange(change);
                added.push(currentRange);
                if (rangeMappings) {
                    rangeMappings.push(<AddedRangeMapping>{ previousRange: EmptyLineRange.afterLine(previousRevisionLine), currentRange });
                }
                currentRevisionLine += change.count!;
            } else if (change.removed && next && next.added) {
                const isFirstChange = i === 0;
                const isLastChange = i === changes.length - 2;
                const isNextEmptyLine = next.value.length > 0 && current[next.value[0]].length === 0;
                const isPrevEmptyLine = change.value.length > 0 && previous[change.value[0]].length === 0;

                if (isFirstChange && isNextEmptyLine) {
                    // special case: removing at the beginning
                    removed.push(0);
                    if (rangeMappings) {
                        rangeMappings.push(<RemovedRangeMapping>{ previousRange: toLineRange(change), currentRange: EmptyLineRange.atBeginning });
                    }
                    previousRevisionLine += change.count!;
                } else if (isFirstChange && isPrevEmptyLine) {
                    // special case: adding at the beginning
                    const currentRange = toLineRange(next);
                    added.push(currentRange);
                    if (rangeMappings) {
                        rangeMappings.push(<AddedRangeMapping>{ previousRange: EmptyLineRange.atBeginning, currentRange });
                    }
                    currentRevisionLine += next.count!;
                } else if (isLastChange && isNextEmptyLine) {
                    removed.push(currentRevisionLine + 1 /* = empty line */);
                    if (rangeMappings) {
                        rangeMappings.push(<RemovedRangeMapping>{ previousRange: toLineRange(change), currentRange: EmptyLineRange.afterLine(currentRevisionLine + 1) });
                    }
                    previousRevisionLine += change.count!;
                } else {
                    // default case is a modification
                    const currentRange = toLineRange(next);
                    modified.push(currentRange);
                    if (rangeMappings) {
                        rangeMappings.push(<ModifiedRangeMapping>{ previousRange: toLineRange(change), currentRange });
                    }
                    currentRevisionLine += next.count!;
                    previousRevisionLine += change.count!;
                }
                i++; // consume next eagerly
            } else if (change.removed && !(next && next.added)) {
                // case: removal
                removed.push(Math.max(0, currentRevisionLine));
                if (rangeMappings) {
                    rangeMappings.push(<RemovedRangeMapping>{ previousRange: toLineRange(change), currentRange: EmptyLineRange.afterLine(currentRevisionLine) });
                }
                previousRevisionLine += change.count!;
            } else {
                // case: unchanged region
                currentRevisionLine += change.count!;
                previousRevisionLine += change.count!;
            }
        }
        return <DirtyDiff>{ added, removed, modified, rangeMappings };
    }

}

class ArrayDiff extends jsdiff.Diff {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    override tokenize(value: any): any {
        return value;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    override join(value: any): any {
        return value;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    override removeEmpty(value: any): any {
        return value;
    }
}

const arrayDiff = new ArrayDiff();

/**
 * Computes diff without copying data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function diffArrays(oldArr: ContentLinesArrayLike, newArr: ContentLinesArrayLike): DiffResult[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return arrayDiff.diff(oldArr as any, newArr as any) as any;
}

function toLineRange({ value }: DiffResult): LineRange {
    const [start, end] = value;
    return { start, end };
}

export interface DiffResult {
    value: [number, number];
    count?: number;
    added?: boolean;
    removed?: boolean;
}

export interface DirtyDiffOptions {
    /**
     * Indicates whether {@link DirtyDiff.rangeMappings} need to be computed.
     */
    rangeMappings?: boolean;
}

export interface DirtyDiff {
    /**
     * Lines added by comparison to previous revision.
     */
    readonly added: LineRange[];
    /**
     * Lines, after which lines were removed by comparison to previous revision.
     */
    readonly removed: number[];
    /**
     * Lines modified by comparison to previous revision.
     */
    readonly modified: LineRange[];
    /**
     * Range mappings for the diff, if {@link DirtyDiffOptions.rangeMappings requested}.
     */
    readonly rangeMappings?: RangeMapping[];
}

/**
 * Represents a range that starts at the beginning of the {@link start} line
 * and spans up to the end of the {@link end} line.
 */
export interface LineRange {
    start: number;
    end: number;
}

/**
 * Represents a range that starts and ends either at the beginning of the {@link start} line or at the end of the {@link end} line.
 */
export type EmptyLineRange = { start: number; end?: undefined; } | { start?: undefined; end: number };

/**
 * Represents a range that starts and ends either at the beginning of the file or at the end of the {@link end} line.
 */
export type NormalizedEmptyLineRange = { start: 0; end?: undefined; } | { start?: undefined; end: number };

export namespace LineRange {
    export function isEmpty(range: LineRange | EmptyLineRange): range is EmptyLineRange {
        return range.start === undefined || range.end === undefined;
    }
    export function getStartPosition(range: LineRange | EmptyLineRange): Position {
        if (range.start === undefined) {
            return Position.create(range.end, Number.MAX_SAFE_INTEGER);
        }
        return Position.create(range.start, 0);
    }
    export function getEndPosition(range: LineRange | EmptyLineRange): Position {
        if (range.end === undefined) {
            return Position.create(range.start, 0);
        }
        return Position.create(range.end, Number.MAX_SAFE_INTEGER);
    }
    export function getLineCount(range: LineRange | EmptyLineRange): number {
        if (isEmpty(range)) {
            return 0;
        }
        return range.end - range.start + 1;
    }
}

export namespace EmptyLineRange {
    /**
     * A {@link NormalizedEmptyLineRange} that starts and ends at the beginning of the file.
     */
    export const atBeginning: { readonly start: 0 } = { start: 0 };

    /**
     * Returns a {@link NormalizedEmptyLineRange} positioned just after the given line.
     * @param line line, after which an empty line range is to be returned.
     *  May be negative, in which case an empty line range at the beginning of the file is returned
     * @returns an empty line range that starts and ends just after the given line
     */
    export function afterLine(line: number): NormalizedEmptyLineRange {
        if (line < 0) {
            return atBeginning;
        }
        return { end: line };
    }
}

export type RangeMapping = AddedRangeMapping | RemovedRangeMapping | ModifiedRangeMapping;

export interface AddedRangeMapping {
    previousRange: NormalizedEmptyLineRange;
    currentRange: LineRange;
}

export interface RemovedRangeMapping {
    previousRange: LineRange;
    currentRange: NormalizedEmptyLineRange;
}

export interface ModifiedRangeMapping {
    previousRange: LineRange;
    currentRange: LineRange;
}
