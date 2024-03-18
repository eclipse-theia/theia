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
import { Position, Range, uinteger } from '@theia/core/shared/vscode-languageserver-protocol';

export class DiffComputer {

    computeDiff(previous: ContentLinesArrayLike, current: ContentLinesArrayLike): DiffResult[] {
        const diffResult = diffArrays(previous, current);
        return diffResult;
    }

    computeDirtyDiff(previous: ContentLinesArrayLike, current: ContentLinesArrayLike): DirtyDiff {
        const changes: Change[] = [];
        const diffResult = this.computeDiff(previous, current);
        let currentRevisionLine = -1;
        let previousRevisionLine = -1;
        for (let i = 0; i < diffResult.length; i++) {
            const change = diffResult[i];
            const next = diffResult[i + 1];
            if (change.added) {
                // case: addition
                changes.push({ previousRange: LineRange.createEmptyLineRange(previousRevisionLine + 1), currentRange: toLineRange(change) });
                currentRevisionLine += change.count!;
            } else if (change.removed && next && next.added) {
                const isFirstChange = i === 0;
                const isLastChange = i === diffResult.length - 2;
                const isNextEmptyLine = next.value.length > 0 && current[next.value[0]].length === 0;
                const isPrevEmptyLine = change.value.length > 0 && previous[change.value[0]].length === 0;

                if (isFirstChange && isNextEmptyLine) {
                    // special case: removing at the beginning
                    changes.push({ previousRange: toLineRange(change), currentRange: LineRange.createEmptyLineRange(0) });
                    previousRevisionLine += change.count!;
                } else if (isFirstChange && isPrevEmptyLine) {
                    // special case: adding at the beginning
                    changes.push({ previousRange: LineRange.createEmptyLineRange(0), currentRange: toLineRange(next) });
                    currentRevisionLine += next.count!;
                } else if (isLastChange && isNextEmptyLine) {
                    changes.push({ previousRange: toLineRange(change), currentRange: LineRange.createEmptyLineRange(currentRevisionLine + 2) });
                    previousRevisionLine += change.count!;
                } else {
                    // default case is a modification
                    changes.push({ previousRange: toLineRange(change), currentRange: toLineRange(next) });
                    currentRevisionLine += next.count!;
                    previousRevisionLine += change.count!;
                }
                i++; // consume next eagerly
            } else if (change.removed && !(next && next.added)) {
                // case: removal
                changes.push({ previousRange: toLineRange(change), currentRange: LineRange.createEmptyLineRange(currentRevisionLine + 1) });
                previousRevisionLine += change.count!;
            } else {
                // case: unchanged region
                currentRevisionLine += change.count!;
                previousRevisionLine += change.count!;
            }
        }
        return { changes };
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
    return LineRange.create(start, end + 1);
}

export interface DiffResult {
    value: [number, number];
    count?: number;
    added?: boolean;
    removed?: boolean;
}

export interface DirtyDiff {
    readonly changes: readonly Change[];
}

export interface Change {
    readonly previousRange: LineRange;
    readonly currentRange: LineRange;
}

export namespace Change {
    export function isAddition(change: Change): boolean {
        return LineRange.isEmpty(change.previousRange);
    }
    export function isRemoval(change: Change): boolean {
        return LineRange.isEmpty(change.currentRange);
    }
    export function isModification(change: Change): boolean {
        return !isAddition(change) && !isRemoval(change);
    }
}

export interface LineRange {
    readonly start: number;
    readonly end: number;
}

export namespace LineRange {
    export function create(start: number, end: number): LineRange {
        if (start < 0 || end < 0 || start > end) {
            throw new Error(`Invalid line range: { start: ${start}, end: ${end} }`);
        }
        return { start, end };
    }
    export function createSingleLineRange(line: number): LineRange {
        return create(line, line + 1);
    }
    export function createEmptyLineRange(line: number): LineRange {
        return create(line, line);
    }
    export function isEmpty(range: LineRange): boolean {
        return range.start === range.end;
    }
    export function getStartPosition(range: LineRange): Position {
        if (isEmpty(range)) {
            return getEndPosition(range);
        }
        return Position.create(range.start, 0);
    }
    export function getEndPosition(range: LineRange): Position {
        if (range.end < 1) {
            return Position.create(0, 0);
        }
        return Position.create(range.end - 1, uinteger.MAX_VALUE);
    }
    export function toRange(range: LineRange): Range {
        return Range.create(getStartPosition(range), getEndPosition(range));
    }
    export function getLineCount(range: LineRange): number {
        return range.end - range.start;
    }
}
