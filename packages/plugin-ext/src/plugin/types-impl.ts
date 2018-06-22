/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { illegalArgument } from '../common/errors';

export class Disposable {
    private disposable: undefined | (() => void);

    constructor(func: () => void) {
        this.disposable = func;
    }
    /**
     * Dispose this object.
     */
    dispose(): void {
        if (this.disposable) {
            this.disposable();
            this.disposable = undefined;
        }
    }

    static create(func: () => void): Disposable {
        return new Disposable(func);
    }
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2
}

export enum TextEditorLineNumbersStyle {
    Off = 0,
    On = 1,
    Relative = 2
}

/**
 * Denotes a column in the editor window.
 * Columns are used to show editors side by side.
 */
export enum ViewColumn {
    Active = -1,
    One = 1,
    Two = 2,
    Three = 3
}

/**
 * Represents sources that can cause `window.onDidChangeEditorSelection`
 */
export enum TextEditorSelectionChangeKind {
    Keyboard = 1,

    Mouse = 2,

    Command = 3
}

export namespace TextEditorSelectionChangeKind {
    export function fromValue(s: string | undefined) {
        switch (s) {
            case 'keyboard': return TextEditorSelectionChangeKind.Keyboard;
            case 'mouse': return TextEditorSelectionChangeKind.Mouse;
            case 'api': return TextEditorSelectionChangeKind.Command;
        }
        return undefined;
    }
}

export class Position {
    private _line: number;
    private _character: number;
    constructor(line: number, char: number) {
        if (line < 0) {
            throw new Error('line must be greater than 0');
        }
        if (char < 0) {
            throw new Error('char must be greater than 0');
        }
        this._line = line;
        this._character = char;
    }

    get line(): number {
        return this._line;
    }

    get character(): number {
        return this._character;
    }

    isBefore(other: Position): boolean {
        if (this._line < other._line) {
            return true;
        }
        if (other._line < this._line) {
            return false;
        }
        return this._character < other._character;
    }

    isBeforeOrEqual(other: Position): boolean {
        if (this._line < other._line) {
            return true;
        }
        if (other._line < this._line) {
            return false;
        }
        return this._character <= other._character;
    }

    isAfter(other: Position): boolean {
        return !this.isBeforeOrEqual(other);
    }

    isAfterOrEqual(other: Position): boolean {
        return !this.isBefore(other);
    }

    isEqual(other: Position): boolean {
        return this._line === other._line && this._character === other._character;
    }

    compareTo(other: Position): number {
        if (this._line < other._line) {
            return -1;
        } else if (this._line > other.line) {
            return 1;
        } else {
            // equal line
            if (this._character < other._character) {
                return -1;
            } else if (this._character > other._character) {
                return 1;
            } else {
                // equal line and character
                return 0;
            }
        }
    }

    translate(change: { lineDelta?: number; characterDelta?: number; }): Position;
    translate(lineDelta?: number, characterDelta?: number): Position;
    translate(lineDeltaOrChange: number | { lineDelta?: number; characterDelta?: number; } | undefined, characterDelta: number = 0): Position {

        if (lineDeltaOrChange === null || characterDelta === null) {
            throw illegalArgument();
        }

        let lineDelta: number;
        if (typeof lineDeltaOrChange === 'undefined') {
            lineDelta = 0;
        } else if (typeof lineDeltaOrChange === 'number') {
            lineDelta = lineDeltaOrChange;
        } else {
            lineDelta = typeof lineDeltaOrChange.lineDelta === 'number' ? lineDeltaOrChange.lineDelta : 0;
            characterDelta = typeof lineDeltaOrChange.characterDelta === 'number' ? lineDeltaOrChange.characterDelta : 0;
        }

        if (lineDelta === 0 && characterDelta === 0) {
            return this;
        }
        return new Position(this.line + lineDelta, this.character + characterDelta);
    }

    with(change: { line?: number; character?: number; }): Position;
    with(line?: number, character?: number): Position;
    with(lineOrChange: number | { line?: number; character?: number; } | undefined, character: number = this.character): Position {

        if (lineOrChange === null || character === null) {
            throw illegalArgument();
        }

        let line: number;
        if (typeof lineOrChange === 'undefined') {
            line = this.line;

        } else if (typeof lineOrChange === 'number') {
            line = lineOrChange;

        } else {
            line = typeof lineOrChange.line === 'number' ? lineOrChange.line : this.line;
            character = typeof lineOrChange.character === 'number' ? lineOrChange.character : this.character;
        }

        if (line === this.line && character === this.character) {
            return this;
        }
        return new Position(line, character);
    }

    static Min(...positions: Position[]): Position {
        let result = positions.pop();
        for (const p of positions) {
            if (p.isBefore(result!)) {
                result = p;
            }
        }
        return result!;
    }

    static Max(...positions: Position[]): Position {
        let result = positions.pop();
        for (const p of positions) {
            if (p.isAfter(result!)) {
                result = p;
            }
        }
        return result!;
    }

    static isPosition(other: {}): other is Position {
        if (!other) {
            return false;
        }
        if (other instanceof Position) {
            return true;
        }
        const { line, character } = <Position>other;
        if (typeof line === 'number' && typeof character === 'number') {
            return true;
        }
        return false;
    }
}

export class Range {
    protected _start: Position;
    protected _end: Position;

    constructor(start: Position, end: Position);
    constructor(startLine: number, startColumn: number, endLine: number, endColumn: number);
    constructor(startLineOrStart: number | Position, startColumnOrEnd: number | Position, endLine?: number, endColumn?: number) {
        let start: Position | undefined = undefined;
        let end: Position | undefined = undefined;

        if (typeof startLineOrStart === 'number' && typeof startColumnOrEnd === 'number' && typeof endLine === 'number' && typeof endColumn === 'number') {
            start = new Position(startLineOrStart, startColumnOrEnd);
            end = new Position(endLine, endColumn);
        } else if (startLineOrStart instanceof Position && startColumnOrEnd instanceof Position) {
            start = startLineOrStart;
            end = startColumnOrEnd;
        }

        if (!start || !end) {
            throw new Error('Invalid arguments');
        }

        if (start.isBefore(end)) {
            this._start = start;
            this._end = end;
        } else {
            this._start = end;
            this._end = start;
        }
    }

    get start(): Position {
        return this._start;
    }

    get end(): Position {
        return this._end;
    }

    contains(positionOrRange: Position | Range): boolean {
        if (positionOrRange instanceof Range) {
            return this.contains(positionOrRange._start)
                && this.contains(positionOrRange._end);

        } else if (positionOrRange instanceof Position) {
            if (positionOrRange.isBefore(this._start)) {
                return false;
            }
            if (this._end.isBefore(positionOrRange)) {
                return false;
            }
            return true;
        }
        return false;
    }

    isEqual(other: Range): boolean {
        return this._start.isEqual(other._start) && this._end.isEqual(other._end);
    }

    intersection(other: Range): Range | undefined {
        const start = Position.Max(other.start, this._start);
        const end = Position.Min(other.end, this._end);
        if (start.isAfter(end)) {
            // this happens when there is no overlap:
            // |-----|
            //          |----|
            return undefined;
        }
        return new Range(start, end);
    }

    union(other: Range): Range {
        if (this.contains(other)) {
            return this;
        } else if (other.contains(this)) {
            return other;
        }
        const start = Position.Min(other.start, this._start);
        const end = Position.Max(other.end, this.end);
        return new Range(start, end);
    }

    get isEmpty(): boolean {
        return this._start.isEqual(this._end);
    }

    get isSingleLine(): boolean {
        return this._start.line === this._end.line;
    }

    with(change: { start?: Position, end?: Position }): Range;
    with(start?: Position, end?: Position): Range;
    with(startOrChange: Position | { start?: Position, end?: Position } | undefined, end: Position = this.end): Range {

        if (startOrChange === null || end === null) {
            throw illegalArgument();
        }

        let start: Position;
        if (!startOrChange) {
            start = this.start;

        } else if (Position.isPosition(startOrChange)) {
            start = startOrChange;

        } else {
            start = startOrChange.start || this.start;
            end = startOrChange.end || this.end;
        }

        if (start.isEqual(this._start) && end.isEqual(this.end)) {
            return this;
        }
        return new Range(start, end);
    }

}

export class Selection extends Range {
    private _anchor: Position;
    private _active: Position;
    constructor(anchor: Position, active: Position);
    constructor(anchorLine: number, anchorColumn: number, activeLine: number, activeColumn: number);
    constructor(anchorLineOrAnchor: number | Position, anchorColumnOrActive: number | Position, activeLine?: number, activeColumn?: number) {
        let anchor: Position | undefined = undefined;
        let active: Position | undefined = undefined;

        if (typeof anchorLineOrAnchor === 'number' && typeof anchorColumnOrActive === 'number' && typeof activeLine === 'number' && typeof activeColumn === 'number') {
            anchor = new Position(anchorLineOrAnchor, anchorColumnOrActive);
            active = new Position(activeLine, activeColumn);
        } else if (anchorLineOrAnchor instanceof Position && anchorColumnOrActive instanceof Position) {
            anchor = anchorLineOrAnchor;
            active = anchorColumnOrActive;
        }

        if (!anchor || !active) {
            throw new Error('Invalid arguments');
        }

        super(anchor, active);

        this._anchor = anchor;
        this._active = active;
    }

    get active(): Position {
        return this._active;
    }

    get anchor(): Position {
        return this._anchor;
    }

    get isReversed(): boolean {
        return this._anchor === this._end;
    }
}

export enum EndOfLine {
    LF = 1,
    CRLF = 2
}

export class SnippetString {

    static isSnippetString(thing: {}): thing is SnippetString {
        if (thing instanceof SnippetString) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return typeof (<SnippetString>thing).value === 'string';
    }

    private static _escape(value: string): string {
        return value.replace(/\$|}|\\/g, '\\$&');
    }

    private _tabstop: number = 1;

    value: string;

    constructor(value?: string) {
        this.value = value || '';
    }

    appendText(string: string): SnippetString {
        this.value += SnippetString._escape(string);
        return this;
    }

    appendTabstop(number: number = this._tabstop++): SnippetString {
        this.value += '$';
        this.value += number;
        return this;
    }

    appendPlaceholder(value: string | ((snippet: SnippetString) => void), number: number = this._tabstop++): SnippetString {

        if (typeof value === 'function') {
            const nested = new SnippetString();
            nested._tabstop = this._tabstop;
            value(nested);
            this._tabstop = nested._tabstop;
            value = nested.value;
        } else {
            value = SnippetString._escape(value);
        }

        this.value += '${';
        this.value += number;
        this.value += ':';
        this.value += value;
        this.value += '}';

        return this;
    }

    appendVariable(name: string, defaultValue?: string | ((snippet: SnippetString) => void)): SnippetString {

        if (typeof defaultValue === 'function') {
            const nested = new SnippetString();
            nested._tabstop = this._tabstop;
            defaultValue(nested);
            this._tabstop = nested._tabstop;
            defaultValue = nested.value;

        } else if (typeof defaultValue === 'string') {
            defaultValue = defaultValue.replace(/\$|}/g, '\\$&');
        }

        this.value += '${';
        this.value += name;
        if (defaultValue) {
            this.value += ':';
            this.value += defaultValue;
        }
        this.value += '}';

        return this;
    }
}

export class MarkdownString {

    value: string;
    isTrusted?: boolean;

    constructor(value?: string) {
        this.value = value || '';
    }

    appendText(value: string): MarkdownString {
        // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
        this.value += value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
        return this;
    }

    appendMarkdown(value: string): MarkdownString {
        this.value += value;
        return this;
    }

    appendCodeblock(code: string, language: string = ''): MarkdownString {
        this.value += '\n```';
        this.value += language;
        this.value += '\n';
        this.value += code;
        this.value += '\n```\n';
        return this;
    }
}

export class ThemeColor {
    constructor(public id: string) {
    }
}

export enum TextEditorRevealType {
    Default = 0,
    InCenter = 1,
    InCenterIfOutsideViewport = 2,
    AtTop = 3
}

/**
 * These values match very carefully the values of `TrackedRangeStickiness`
 */
export enum DecorationRangeBehavior {
    /**
     * TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
     */
    OpenOpen = 0,
    /**
     * TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
     */
    ClosedClosed = 1,
    /**
     * TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
     */
    OpenClosed = 2,
    /**
     * TrackedRangeStickiness.GrowsOnlyWhenTypingAfter
     */
    ClosedOpen = 3
}

/**
 * Vertical Lane in the overview ruler of the editor.
 */
export enum OverviewRulerLane {
    Left = 1,
    Center = 2,
    Right = 4,
    Full = 7
}

export enum ConfigurationTarget {
    User = 0,
    Workspace = 1
}
