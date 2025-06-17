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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/browser/model/lineRange.ts

import { Range, uinteger } from '@theia/core/shared/vscode-languageserver-protocol';
import { TextEditorDocument } from '@theia/editor/lib/browser/editor';

/**
 * Represents a range of whole lines of text. Line numbers are zero-based.
 */
export class LineRange {
    static compareByStart(a: LineRange, b: LineRange): number {
        return a.startLineNumber - b.startLineNumber;
    }

    static fromLineNumbers(startLineNumber: number, endExclusiveLineNumber: number): LineRange {
        return new LineRange(startLineNumber, endExclusiveLineNumber - startLineNumber);
    }

    constructor(
        /** A zero-based number of the start line. The range starts exactly at the beginning of this line. */
        readonly startLineNumber: number,
        readonly lineCount: number
    ) {
        if (startLineNumber < 0 || lineCount < 0) {
            throw new Error('Invalid line range: ' + this.toString());
        }
    }

    join(other: LineRange): LineRange {
        return LineRange.fromLineNumbers(Math.min(this.startLineNumber, other.startLineNumber), Math.max(this.endLineNumberExclusive, other.endLineNumberExclusive));
    }

    /** A zero-based number of the end line. The range ends just before the beginning of this line. */
    get endLineNumberExclusive(): number {
        return this.startLineNumber + this.lineCount;
    }

    get isEmpty(): boolean {
        return this.lineCount === 0;
    }

    /**
     * Returns `false` if there is at least one line between `this` and `other`.
     */
    touches(other: LineRange): boolean {
        return this.startLineNumber <= other.endLineNumberExclusive && other.startLineNumber <= this.endLineNumberExclusive;
    }

    isAfter(other: LineRange): boolean {
        return this.startLineNumber >= other.endLineNumberExclusive;
    }

    isBefore(other: LineRange): boolean {
        return other.startLineNumber >= this.endLineNumberExclusive;
    }

    delta(lineDelta: number): LineRange {
        return new LineRange(this.startLineNumber + lineDelta, this.lineCount);
    }

    deltaStart(lineDelta: number): LineRange {
        return new LineRange(this.startLineNumber + lineDelta, this.lineCount - lineDelta);
    }

    deltaEnd(lineDelta: number): LineRange {
        return new LineRange(this.startLineNumber, this.lineCount + lineDelta);
    }

    toString(): string {
        return `[${this.startLineNumber},${this.endLineNumberExclusive})`;
    }

    equals(other: LineRange): boolean {
        return this.startLineNumber === other.startLineNumber && this.lineCount === other.lineCount;
    }

    contains(other: LineRange): boolean {
        return this.startLineNumber <= other.startLineNumber && other.endLineNumberExclusive <= this.endLineNumberExclusive;
    }

    containsLine(lineNumber: number): boolean {
        return this.startLineNumber <= lineNumber && lineNumber < this.endLineNumberExclusive;
    }

    getLines(document: TextEditorDocument): string[] {
        const result = new Array(this.lineCount);
        for (let i = 0; i < this.lineCount; i++) {
            result[i] = document.getLineContent(this.startLineNumber + i + 1); // note that getLineContent expects a one-based line number
        }
        return result;
    }

    toRange(): Range {
        return Range.create(this.startLineNumber, 0, this.endLineNumberExclusive, 0);
    }

    toInclusiveRange(): Range | undefined {
        if (this.isEmpty) {
            return undefined;
        }
        return Range.create(this.startLineNumber, 0, this.endLineNumberExclusive - 1, uinteger.MAX_VALUE);
    }

    toInclusiveRangeOrEmpty(): Range {
        if (this.isEmpty) {
            return Range.create(this.startLineNumber, 0, this.startLineNumber, 0);
        }
        return Range.create(this.startLineNumber, 0, this.endLineNumberExclusive - 1, uinteger.MAX_VALUE);
    }
}
