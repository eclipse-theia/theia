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

import { Location, Range, Position } from 'vscode-languageserver-types';

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

function startsAt(a: Range, position: Position): boolean {
    const pos1 = a.start;
    return pos1.line === position.line
        && pos1.character === position.character;
}

export function filterSame(locations: Location[], uri: string, position: Position): Location[] {
    return locations.filter(candidate => candidate.uri !== uri
        || !startsAt(candidate.range, position)
    );
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
