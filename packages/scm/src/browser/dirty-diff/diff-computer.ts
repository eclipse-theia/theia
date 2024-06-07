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
        let currentRevisionLine = 0;
        let previousRevisionLine = 0;
        for (let i = 0; i < diffResult.length; i++) {
            const diff = diffResult[i];
            const delta = diff.count || 0;
            if (diff.added) {
                // case: addition
                if (diffResult[i - 1]?.removed) { // merge with previous removal
                    changes[changes.length - 1].currentRange.end += delta;
                } else {
                    changes.push({
                        previousRange: { start: previousRevisionLine, end: previousRevisionLine },
                        currentRange: { start: currentRevisionLine, end: currentRevisionLine + delta }
                    });
                }
                currentRevisionLine += delta;
            } else if (diff.removed) {
                // case: removal
                if (diffResult[i - 1]?.added) { // merge with previous addition
                    changes[changes.length - 1].previousRange.end += delta;
                } else {
                    changes.push({
                        previousRange: { start: previousRevisionLine, end: previousRevisionLine + delta },
                        currentRange: { start: currentRevisionLine, end: currentRevisionLine }
                    });
                }
                previousRevisionLine += delta;
            } else {
                // case: unchanged region
                currentRevisionLine += delta;
                previousRevisionLine += delta;
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
    start: number;
    end: number;
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
