/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Location, Range, Position } from '@theia/core/shared/vscode-languageserver-protocol';

/**
 * Test if `otherRange` is in `range`. If the ranges are equal, will return true.
 */
export function containsRange(range: Range, otherRange: Range): boolean {
    if (otherRange.start.line < range.start.line || otherRange.end.line < range.start.line) {
        return false;
    }
    if (otherRange.start.line > range.end.line || otherRange.end.line > range.end.line) {
        return false;
    }
    if (otherRange.start.line === range.start.line && otherRange.start.character < range.start.character) {
        return false;
    }
    if (otherRange.end.line === range.end.line && otherRange.end.character > range.end.character) {
        return false;
    }
    return true;
}

export function containsPosition(range: Range, position: Position): boolean {
    return comparePosition(range.start, position) >= 0 && comparePosition(range.end, position) <= 0;
}

function sameStart(a: Range, b: Range): boolean {
    const pos1 = a.start;
    const pos2 = b.start;
    return pos1.line === pos2.line
        && pos1.character === pos2.character;
}

export function filterSame(locations: Location[], definition: Location): Location[] {
    return locations.filter(candidate => candidate.uri !== definition.uri
        || !sameStart(candidate.range, definition.range)
    );
}

export function comparePosition(left: Position, right: Position): number {
    const diff = right.line - left.line;
    if (diff !== 0) {
        return diff;
    }
    return right.character - left.character;
}

export function filterUnique(locations: Location[] | null): Location[] {
    if (!locations) {
        return [];
    }
    const result: Location[] = [];
    const set = new Set<string>();
    for (const location of locations) {
        const json = JSON.stringify(location);
        if (!set.has(json)) {
            set.add(json);
            result.push(location);
        }
    }
    return result;
}

export function startsAfter(a: Range, b: Range): boolean {
    if (a.start.line > b.start.line) {
        return true;
    }
    if (a.start.line === b.start.line) {
        if (a.start.character > b.start.character) {
            return true;
        }
        if (a.start.character === b.start.character) {
            if (a.end.line > b.end.line) {
                return true;
            }
        }
    }
    return false;
}

export function isSame(a: Location, b: Location): boolean {
    return a.uri === b.uri
        && a.range.start.line === b.range.start.line
        && a.range.end.line === b.range.end.line
        && a.range.start.character === b.range.start.character
        && a.range.end.character === b.range.end.character;
}
