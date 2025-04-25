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

import { injectable } from '@theia/core/shared/inversify';
import { ArrayUtils } from '@theia/core';
import { LineRangeMapping } from '../model/range-mapping';

export interface DiffSpacers {
    /**
     * An array representing spacers in the original side of the diff.
     * Indices are line numbers in the original document, and values are the height in lines of the spacer directly above the given line.
     * If a value is missing for a line number, the corresponding spacer is assumed to have zero height.
     */
    originalSpacers: number[];
    /**
     * An array representing spacers in the modified side of the diff.
     * Indices are line numbers in the modified document, and values are the height in lines of the spacer directly above the given line.
     * If a value is missing for a line number, the corresponding spacer is assumed to have zero height.
     */
    modifiedSpacers: number[];
    /**
     * An array respresenting a mapping of line numbers for the diff.
     * Indices are line numbers in the original document, and values are the corresponding line numbers in the modified document.
     * If a value is missing for a line number, it is assumed that the line was deleted.
     */
    lineMapping: number[];
}

export type ModifiedSideSpacers = Omit<DiffSpacers, 'originalSpacers'>;

export interface CombinedMultiDiffSpacers {
    originalSpacers: number[];
    modifiedSides: ModifiedSideSpacers[];
}

@injectable()
export class DiffSpacerService {

    computeDiffSpacers(changes: readonly LineRangeMapping[], originalLineCount: number): DiffSpacers {
        const lineMapping: number[] = [];
        const originalSpacers: number[] = [];
        const modifiedSpacers: number[] = [];
        let originalLine = 0;
        let deltaSum = 0;
        for (const { originalRange, modifiedRange } of changes) {
            while (originalLine < originalRange.startLineNumber + Math.min(originalRange.lineCount, modifiedRange.lineCount)) {
                lineMapping[originalLine] = originalLine + deltaSum;
                originalLine++;
            }
            const delta = modifiedRange.lineCount - originalRange.lineCount;
            deltaSum += delta;
            if (delta > 0) {
                originalSpacers[originalLine] = delta;
            }
            if (delta < 0) {
                modifiedSpacers[modifiedRange.endLineNumberExclusive] = -delta;
                originalLine += -delta;
            }
        }
        while (originalLine <= originalLineCount) {
            lineMapping[originalLine] = originalLine + deltaSum;
            originalLine++;
        }
        return { originalSpacers, modifiedSpacers, lineMapping };
    }

    /**
     * Combines multiple {@link DiffSpacers} objects into a {@link CombinedMultiDiffSpacers} object with the appropriately adjusted spacers.
     * The given {@link DiffSpacers} objects are not modified.
     *
     * It is assumed that all of the given {@link DiffSpacers} objects have been computed from diffs against the same original side.
     */
    combineMultiDiffSpacers(multiDiffSpacers: DiffSpacers[]): CombinedMultiDiffSpacers {
        if (multiDiffSpacers.length < 2) {
            throw new Error('At least two items are required');
        }
        this.checkLineMappingsHaveEqualLength(multiDiffSpacers);
        const originalSpacers: number[] = [];
        const modifiedSides: ModifiedSideSpacers[] = [];
        for (const { modifiedSpacers, lineMapping } of multiDiffSpacers) {
            const modifiedSpacersCopy = modifiedSpacers.concat(); // note: copying by concat() preserves empty slots of the sparse array
            modifiedSides.push({ modifiedSpacers: modifiedSpacersCopy, lineMapping });
        }
        const originalLineCount = modifiedSides[0].lineMapping.length;
        for (let originalLine = 0; originalLine < originalLineCount; originalLine++) {
            const max = Math.max(...multiDiffSpacers.map(diffSpacers => diffSpacers.originalSpacers[originalLine] ?? 0));
            if (max > 0) {
                originalSpacers[originalLine] = max;
                for (let i = 0; i < multiDiffSpacers.length; i++) {
                    const delta = max - (multiDiffSpacers[i].originalSpacers[originalLine] ?? 0);
                    if (delta > 0) {
                        const { modifiedSpacers, lineMapping } = modifiedSides[i];
                        const modifiedLine = this.projectLine(originalLine, lineMapping);
                        modifiedSpacers[modifiedLine] = (modifiedSpacers[modifiedLine] ?? 0) + delta;
                    }
                }
            }
        }
        return { originalSpacers, modifiedSides };
    }

    /**
     * Given a {@link CombinedMultiDiffSpacers} object, excludes the original side, returning the modified sides with the appropriately adjusted spacers.
     * The given {@link CombinedMultiDiffSpacers} object is not modified.
     */
    excludeOriginalSide({ modifiedSides }: CombinedMultiDiffSpacers): { modifiedSides: { modifiedSpacers: number[] }[] } {
        if (modifiedSides.length < 2) {
            throw new Error('At least two modified sides are required');
        }
        this.checkLineMappingsHaveEqualLength(modifiedSides);
        const modifiedSidesCopy: { modifiedSpacers: number[] }[] = [];
        for (const { modifiedSpacers } of modifiedSides) {
            const modifiedSpacersCopy = modifiedSpacers.concat(); // note: copying by concat() preserves empty slots of the sparse array
            modifiedSidesCopy.push({ modifiedSpacers: modifiedSpacersCopy });
        }
        // When the original side is excluded, the adjoining spacers in the modified sides can be deflated by removing their intersecting parts.
        const originalLineCount = modifiedSides[0].lineMapping.length;
        for (let originalLine = 0; originalLine < originalLineCount; originalLine++) {
            if (modifiedSides.every(({ lineMapping }) => lineMapping[originalLine] === undefined)) {
                modifiedSides.forEach(({ lineMapping }, index) => {
                    const modifiedLine = this.projectLine(originalLine, lineMapping);
                    const { modifiedSpacers } = modifiedSidesCopy[index];
                    modifiedSpacers[modifiedLine]--;
                });
            }
        }
        return { modifiedSides: modifiedSidesCopy };
    }

    protected checkLineMappingsHaveEqualLength(items: { lineMapping: number[] }[]): void {
        if (!ArrayUtils.checkAdjacentItems(items, (item1, item2) => item1.lineMapping.length === item2.lineMapping.length)) {
            throw new Error('Line mappings must have equal length');
        }
    }

    protected projectLine(originalLine: number, lineMapping: number[]): number {
        let modifiedLine: number | undefined;
        const originalLineCount = lineMapping.length;
        while (originalLine < originalLineCount) {
            modifiedLine = lineMapping[originalLine++];
            if (modifiedLine !== undefined) {
                return modifiedLine;
            }
        }
        throw new Error('Assertion failed');
    }
}
