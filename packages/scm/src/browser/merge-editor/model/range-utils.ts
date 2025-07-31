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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/model/rangeUtils.ts,
// https://github.com/microsoft/vscode/blob/1.96.3/src/vs/editor/common/core/range.ts,
// https://github.com/microsoft/vscode/blob/1.96.3/src/vs/editor/common/core/position.ts,
// https://github.com/microsoft/vscode/blob/1.96.3/src/vs/editor/common/core/textLength.ts

import { Position, Range } from '@theia/core/shared/vscode-languageserver-protocol';

export namespace RangeUtils {

    export function isEmpty(range: Range): boolean {
        return range.start.line === range.end.line && range.start.character === range.end.character;
    }

    export function containsPosition(range: Range, position: Position): boolean {
        if (position.line < range.start.line || position.line > range.end.line) {
            return false;
        }
        if (position.line === range.start.line && position.character < range.start.character) {
            return false;
        }
        if (position.line === range.end.line && position.character >= range.end.character) {
            return false;
        }
        return true;
    }

    export function isBeforeOrTouching(range: Range, other: Range): boolean {
        return (
            range.end.line < other.start.line ||
            (range.end.line === other.start.line &&
                range.end.character <= other.start.character)
        );
    }

    export function union(range: Range, other: Range): Range {
        const start = PositionUtils.isBeforeOrEqual(range.start, other.start) ? range.start : other.start;
        const end = PositionUtils.isBeforeOrEqual(range.end, other.end) ? other.end : range.end;
        return { start, end };
    }

    /**
     * A function that compares ranges, useful for sorting ranges.
     * It will first compare ranges on the start position and then on the end position.
     */
    export function compareUsingStarts(range: Range, other: Range): number {
        if (range.start.line === other.start.line) {
            if (range.start.character === other.start.character) {
                if (range.end.line === other.end.line) {
                    return range.end.character - other.end.character;
                }
                return range.end.line - other.end.line;
            }
            return range.start.character - other.start.character;
        }
        return range.start.line - other.start.line;
    }
}

export namespace PositionUtils {

    export function isBeforeOrEqual(position: Position, other: Position): boolean {
        return compare(position, other) <= 0;
    }

    export function compare(position: Position, other: Position): number {
        if (position.line === other.line) {
            return position.character - other.character;
        }
        return position.line - other.line;
    }

    /**
     * Given two positions, computes the relative position of the greater position against the lesser position.
     */
    export function relativize(position: Position, other: Position): Position {
        if (compare(position, other) > 0) {
            [position, other] = [other, position];
        }
        if (position.line === other.line) {
            return Position.create(0, other.character - position.character);
        } else {
            return Position.create(other.line - position.line, other.character);
        }
    }

    /**
     * Resolves the given relative position against the given position and returns the resulting position.
     */
    export function resolve(position: Position, relativePosition: Position): Position {
        if (relativePosition.line === 0) {
            return Position.create(position.line, position.character + relativePosition.character);
        } else {
            return Position.create(position.line + relativePosition.line, relativePosition.character);
        }
    }
}
