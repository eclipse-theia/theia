/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export function isICellRange(candidate: unknown): candidate is CellRange {
    if (!candidate || typeof candidate !== 'object') {
        return false;
    }
    return typeof (<CellRange>candidate).start === 'number'
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

/**
 * todo@rebornix test and sort
 * @param range
 * @param other
 * @returns
 */

export function cellRangeContains(range: CellRange, other: CellRange): boolean {
    return other.start >= range.start && other.end <= range.end;
}
