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

import { isObject } from '@theia/core';

/**
 * [start, end]
 */
export interface CellRange {
    /**
     * zero based index
     */
    start: number;

    /**
     * zero based index
     */
    end: number;
}

export function isCellRange(candidate: unknown): candidate is CellRange {
    return isObject<CellRange>(candidate)
        && typeof (<CellRange>candidate).start === 'number'
        && typeof (<CellRange>candidate).end === 'number';
}

export function cellIndexesToRanges(indexes: number[]): { start: number, end: number }[] {
    indexes.sort((a, b) => a - b);
    const first = indexes.shift();

    if (first === undefined) {
        return [];
    }

    return indexes.reduce((ranges, num) => {
        if (num <= ranges[0][1]) {
            ranges[0][1] = num + 1;
        } else {
            ranges.unshift([num, num + 1]);
        }
        return ranges;
    }, [[first, first + 1]]).reverse().map(val => ({ start: val[0], end: val[1] }));
}

export function cellRangesToIndexes(ranges: CellRange[]): number[] {
    const indexes = ranges.reduce((a, b) => {
        for (let i = b.start; i < b.end; i++) {
            a.push(i);
        }

        return a;
    }, [] as number[]);

    return indexes;
}

export function reduceCellRanges(ranges: CellRange[]): CellRange[] {
    const sorted = ranges.sort((a, b) => a.start - b.start);
    const first = sorted[0];

    if (!first) {
        return [];
    }

    return sorted.reduce((prev: CellRange[], curr) => {
        const last = prev[prev.length - 1];
        if (last.end >= curr.start) {
            last.end = Math.max(last.end, curr.end);
        } else {
            prev.push(curr);
        }
        return prev;
    }, [first] as CellRange[]);
}

export function cellRangesEqual(a: CellRange[], b: CellRange[]): boolean {
    a = reduceCellRanges(a);
    b = reduceCellRanges(b);
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i].start !== b[i].start || a[i].end !== b[i].end) {
            return false;
        }
    }

    return true;
}

export function cellRangeContains(range: CellRange, other: CellRange): boolean {
    return other.start >= range.start && other.end <= range.end;
}
