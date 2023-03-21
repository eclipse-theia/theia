// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Copied from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/editor/common/core/position.ts

/**
 * A position in the editor. This interface is suitable for serialization.
 */
export interface IPosition {
    /**
     * line number (starts at 1)
     */
    readonly lineNumber: number;
    /**
     * column (the first character in a line is between column 1 and column 2)
     */
    readonly column: number;
}

/**
 * A position in the editor.
 */
export class Position {
    /**
     * line number (starts at 1)
     */
    public readonly lineNumber: number;
    /**
     * column (the first character in a line is between column 1 and column 2)
     */
    public readonly column: number;

    constructor(lineNumber: number, column: number) {
        this.lineNumber = lineNumber;
        this.column = column;
    }

    /**
     * Create a new position from this position.
     *
     * @param newLineNumber new line number
     * @param newColumn new column
     */
    with(newLineNumber: number = this.lineNumber, newColumn: number = this.column): Position {
        if (newLineNumber === this.lineNumber && newColumn === this.column) {
            return this;
        } else {
            return new Position(newLineNumber, newColumn);
        }
    }

    /**
     * Derive a new position from this position.
     *
     * @param deltaLineNumber line number delta
     * @param deltaColumn column delta
     */
    delta(deltaLineNumber: number = 0, deltaColumn: number = 0): Position {
        return this.with(this.lineNumber + deltaLineNumber, this.column + deltaColumn);
    }

    /**
     * Test if this position equals other position
     */
    public equals(other: IPosition): boolean {
        return Position.equals(this, other);
    }

    /**
     * Test if position `a` equals position `b`
     */
    public static equals(a: IPosition | null, b: IPosition | null): boolean {
        if (!a && !b) {
            return true;
        }
        return (
            !!a &&
            !!b &&
            a.lineNumber === b.lineNumber &&
            a.column === b.column
        );
    }

    /**
     * Test if this position is before other position.
     * If the two positions are equal, the result will be false.
     */
    public isBefore(other: IPosition): boolean {
        return Position.isBefore(this, other);
    }

    /**
     * Test if position `a` is before position `b`.
     * If the two positions are equal, the result will be false.
     */
    public static isBefore(a: IPosition, b: IPosition): boolean {
        if (a.lineNumber < b.lineNumber) {
            return true;
        }
        if (b.lineNumber < a.lineNumber) {
            return false;
        }
        return a.column < b.column;
    }

    /**
     * Test if this position is before other position.
     * If the two positions are equal, the result will be true.
     */
    public isBeforeOrEqual(other: IPosition): boolean {
        return Position.isBeforeOrEqual(this, other);
    }

    /**
     * Test if position `a` is before position `b`.
     * If the two positions are equal, the result will be true.
     */
    public static isBeforeOrEqual(a: IPosition, b: IPosition): boolean {
        if (a.lineNumber < b.lineNumber) {
            return true;
        }
        if (b.lineNumber < a.lineNumber) {
            return false;
        }
        return a.column <= b.column;
    }

    /**
     * A function that compares positions, useful for sorting
     */
    public static compare(a: IPosition, b: IPosition): number {
        const aLineNumber = a.lineNumber | 0;
        const bLineNumber = b.lineNumber | 0;

        if (aLineNumber === bLineNumber) {
            const aColumn = a.column | 0;
            const bColumn = b.column | 0;
            return aColumn - bColumn;
        }

        return aLineNumber - bLineNumber;
    }

    /**
     * Clone this position.
     */
    public clone(): Position {
        return new Position(this.lineNumber, this.column);
    }

    /**
     * Convert to a human-readable representation.
     */
    public toString(): string {
        return '(' + this.lineNumber + ',' + this.column + ')';
    }

    // ---

    /**
     * Create a `Position` from an `IPosition`.
     */
    public static lift(pos: IPosition): Position {
        return new Position(pos.lineNumber, pos.column);
    }

    /**
     * Test if `obj` is an `IPosition`.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static isIPosition(obj: any): obj is IPosition {
        return (
            obj
            && (typeof obj.lineNumber === 'number')
            && (typeof obj.column === 'number')
        );
    }
}
