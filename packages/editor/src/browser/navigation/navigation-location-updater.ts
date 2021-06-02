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

import { injectable } from '@theia/core/shared/inversify';
import { NavigationLocation, ContentChangeLocation, CursorLocation, SelectionLocation, Position, Range } from './navigation-location';

/**
 * A navigation location updater that is responsible for adapting editor navigation locations.
 *
 * 1. Inserting or deleting text before the position shifts the position accordingly.
 * 2. Inserting text at the position offset shifts the position accordingly.
 * 3. Inserting or deleting text strictly contained by the position shrinks or stretches the position.
 * 4. Inserting or deleting text after a position does not affect the position.
 * 5. Deleting text which strictly contains the position deletes the position.
 * Note that the position is not deleted if its only shrunken to length zero. To delete a position, the modification must delete from
 * strictly before to strictly after the position.
 * 6. Replacing text contained by the position shrinks or expands the position (but does not shift it), such that the final position
 * contains the original position and the replacing text.
 * 7. Replacing text overlapping the position in other ways is considered as a sequence of first deleting the replaced text and
 * afterwards inserting the new text. Thus, a position is shrunken and can then be shifted (if the replaced text overlaps the offset of the position).
 */
@injectable()
export class NavigationLocationUpdater {

    /**
     * Checks whether `candidateLocation` has to be updated when applying `other`.
     *  - `false` if the `other` does not affect the `candidateLocation`.
     *  - A `NavigationLocation` object if the `candidateLocation` has to be replaced with the return value.
     *  - `undefined` if the candidate has to be deleted.
     *
     * If the `otherLocation` is not a `ContentChangeLocation` or it does not contain any actual content changes, this method returns with `false`
     */
    affects(candidateLocation: NavigationLocation, otherLocation: NavigationLocation): false | NavigationLocation | undefined {
        if (!ContentChangeLocation.is(otherLocation)) {
            return false;
        }
        if (candidateLocation.uri.toString() !== otherLocation.uri.toString()) {
            return false;
        }

        const candidate = NavigationLocation.range(candidateLocation);
        const other = NavigationLocation.range(otherLocation);
        if (candidate === undefined || other === undefined) {
            return false;
        }

        const { uri, type } = candidateLocation;
        const modification = otherLocation.context.text;
        const newLineCount = modification.split(/[\n\r]/g).length - 1;

        // Spec (1. and 2.)
        if (other.end.line < candidate.start.line
            || (other.end.line === candidate.start.line && other.end.character <= candidate.start.character)) {

            // Shortcut for the general case. The user is typing above the candidate range. Nothing to do.
            if (other.start.line === other.end.line && newLineCount === 0) {
                return false;
            }

            const lineDiff = other.start.line - other.end.line + newLineCount;
            let startCharacter = candidate.start.character;
            let endCharacter = candidate.end.character;

            if (other.start.line !== other.end.line) {
                startCharacter = other.start.character + (candidate.start.character - other.end.character) + (modification.length - (modification.lastIndexOf('\n') + 1));
                endCharacter = candidate.start.line === candidate.end.line
                    ? candidate.end.character + startCharacter - candidate.start.character
                    : candidate.end.character;
            }

            const context = this.handleBefore(candidateLocation, other, lineDiff, startCharacter, endCharacter);
            return {
                uri,
                type,
                context
            };
        }

        // Spec (3.,  5., and 6.)
        if (this.contained(other, candidate)) {
            const endLine = candidate.end.line - other.end.line + candidate.start.line + newLineCount;
            let endCharacter = candidate.end.character - (other.end.character - other.start.character) + modification.length;

            if (newLineCount > 0) {
                if (candidate.end.line === other.end.line) {
                    endCharacter = modification.length - (modification.lastIndexOf('\n') + 1) + (candidate.end.character - other.end.character);
                } else {
                    endCharacter = endCharacter - 1;
                }
            }

            const context = this.handleInside(candidateLocation, endLine, endCharacter);
            return {
                uri,
                type,
                context
            };
        }

        // Spec (5.)
        if (other.start.line === candidate.start.line && other.start.character === candidate.start.character
            && (other.end.line > candidate.end.line || (other.end.line === candidate.end.line && other.end.character > candidate.end.character))) {
            return undefined;
        }

        // Spec (4.)
        if (candidate.end.line < other.start.line
            || (candidate.end.line === other.start.line && candidate.end.character < other.end.character)) {
            return false;
        }

        return false;
    }

    protected handleInside(candidate: NavigationLocation, endLine: number, endCharacter: number): NavigationLocation.Context {
        if (CursorLocation.is(candidate)) {
            throw new Error('Modifications are not allowed inside a cursor location.');
        }
        const { start } = NavigationLocation.range(candidate);
        const range = {
            start,
            end: {
                line: endLine,
                character: endCharacter
            }
        };
        if (SelectionLocation.is(candidate)) {
            return range;
        }
        if (ContentChangeLocation.is(candidate)) {
            const { rangeLength, text } = candidate.context;
            return {
                range,
                rangeLength,
                text
            };
        }
        throw new Error(`Unexpected navigation location: ${NavigationLocation.toString(candidate)}.`);
    }

    protected handleBefore(candidate: NavigationLocation, modification: Range, lineDiff: number, startCharacter: number, endCharacter: number): NavigationLocation.Context {
        let range = NavigationLocation.range(candidate);
        range = this.shiftLine(range, lineDiff);
        range = {
            start: {
                line: range.start.line,
                character: startCharacter
            },
            end: {
                line: range.end.line,
                character: endCharacter
            }
        };
        if (CursorLocation.is(candidate)) {
            return range.start;
        }
        if (SelectionLocation.is(candidate)) {
            return range;
        }
        if (ContentChangeLocation.is(candidate)) {
            const { rangeLength, text } = candidate.context;
            return {
                range,
                rangeLength,
                text
            };
        }
        throw new Error(`Unexpected navigation location: ${NavigationLocation.toString(candidate)}.`);
    }

    protected shiftLine(position: Position, diff: number): Position;
    protected shiftLine(range: Range, diff: number): Range;
    protected shiftLine(input: Position | Range, diff: number): Position | Range {
        if (Position.is(input)) {
            const { line, character } = input;
            return {
                line: line + diff,
                character
            };
        }
        const { start, end } = input;
        return {
            start: this.shiftLine(start, diff),
            end: this.shiftLine(end, diff)
        };
    }

    /**
     * `true` if `subRange` is strictly contained in the `range`. Otherwise, `false`.
     */
    protected contained(subRange: Range, range: Range): boolean {
        if (subRange.start.line > range.start.line && subRange.end.line < range.end.line) {
            return true;
        }
        if (subRange.start.line < range.start.line || subRange.end.line > range.end.line) {
            return false;
        }
        if (subRange.start.line === range.start.line && subRange.start.character < range.start.character) {
            return false;
        }
        if (subRange.end.line === range.end.line && subRange.end.character > range.end.character) {
            return false;
        }
        return true;
    }

}
