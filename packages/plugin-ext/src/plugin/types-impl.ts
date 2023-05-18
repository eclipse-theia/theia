// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// copied from https://github.com/microsoft/vscode/blob/1.37.0/src/vs/workbench/api/common/extHostTypes.ts
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

/* eslint-disable no-null/no-null */

import { UUID } from '@theia/core/shared/@phosphor/coreutils';
import { illegalArgument } from '../common/errors';
import type * as theia from '@theia/plugin';
import { URI as CodeURI, UriComponents } from '@theia/core/shared/vscode-uri';
import { relative } from '../common/paths-util';
import { startsWithIgnoreCase } from '@theia/core/lib/common/strings';
import { SymbolKind } from '../common/plugin-api-rpc-model';
import { FileSystemProviderErrorCode, markAsFileSystemProviderError } from '@theia/filesystem/lib/common/files';
import * as paths from 'path';
import { es5ClassCompat } from '../common/types';
import { isObject, isStringArray } from '@theia/core/lib/common';

/**
 * This is an implementation of #theia.Uri based on vscode-uri.
 * This is supposed to fix https://github.com/eclipse-theia/theia/issues/8752
 * We cannot simply upgrade the dependency, because the current version 3.x
 * is not compatible with our current codebase
 */
@es5ClassCompat
export class URI extends CodeURI implements theia.Uri {
    protected constructor(scheme: string, authority?: string, path?: string, query?: string, fragment?: string, _strict?: boolean);
    protected constructor(components: UriComponents);
    protected constructor(schemeOrData: string | UriComponents, authority?: string, path?: string, query?: string, fragment?: string, _strict: boolean = false) {
        if (typeof schemeOrData === 'string') {
            super(schemeOrData, authority, path, query, fragment, _strict);
        } else {
            super(schemeOrData);
        }
    }

    /**
     * Override to create the correct class.
     */
    override with(change: {
        scheme?: string;
        authority?: string | null;
        path?: string | null;
        query?: string | null;
        fragment?: string | null;
    }): URI {
        return new URI(super.with(change));
    }

    static joinPath(uri: URI, ...pathSegments: string[]): URI {
        if (!uri.path) {
            throw new Error('\'joinPath\' called on URI without path');
        }
        const newPath = paths.posix.join(uri.path, ...pathSegments);
        return new URI(uri.scheme, uri.authority, newPath, uri.query, uri.fragment);
    }

    /**
     * Override to create the correct class.
     * @param data
     */
    static override revive(data: UriComponents | CodeURI): URI;
    static override revive(data: UriComponents | CodeURI | null): URI | null;
    static override revive(data: UriComponents | CodeURI | undefined): URI | undefined
    static override revive(data: UriComponents | CodeURI | undefined | null): URI | undefined | null {
        const uri = CodeURI.revive(data);
        return uri ? new URI(uri) : undefined;
    }

    static override parse(value: string, _strict?: boolean): URI {
        return new URI(CodeURI.parse(value, _strict));
    }

    static override file(path: string): URI {
        return new URI(CodeURI.file(path));
    }

    /**
     * There is quite some magic in to vscode URI class related to
     * transferring via JSON.stringify(). Making the CodeURI instance
     * makes sure we transfer this object as a vscode-uri URI.
     */
    override toJSON(): UriComponents {
        return CodeURI.from(this).toJSON();
    }
}

@es5ClassCompat
export class Disposable {
    private disposable: undefined | (() => void);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static from(...disposables: { dispose(): any }[]): Disposable {
        return new Disposable(() => {
            if (disposables) {
                for (const disposable of disposables) {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                }
            }
        });
    }

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

    static NULL: Disposable;
}

export interface AccessibilityInformation {
    label: string;
    role?: string;
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
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
    Six = 6,
    Seven = 7,
    Eight = 8,
    Nine = 9
}

/**
 * Represents a color theme kind.
 */
export enum ColorThemeKind {
    Light = 1,
    Dark = 2,
    HighContrast = 3,
    HighContrastLight = 4
}

export enum ExtensionMode {
    /**
     * The extension is installed normally (for example, from the marketplace
     * or VSIX) in the editor.
     */
    Production = 1,

    /**
     * The extension is running from an `--extensionDevelopmentPath` provided
     * when launching the editor.
     */
    Development = 2,

    /**
     * The extension is running from an `--extensionTestsPath` and
     * the extension host is running unit tests.
     */
    Test = 3,
}

export enum ExtensionKind {
    UI = 1,
    Workspace = 2
}

/**
 * Represents the validation type of the Source Control input.
 */
export enum SourceControlInputBoxValidationType {

    /**
     * Something not allowed by the rules of a language or other means.
     */
    Error = 0,

    /**
     * Something suspicious but allowed.
     */
    Warning = 1,

    /**
     * Something to inform about but not a problem.
     */
    Information = 2
}

export enum ExternalUriOpenerPriority {
    None = 0,
    Option = 1,
    Default = 2,
    Preferred = 3,
}

@es5ClassCompat
export class ColorTheme implements theia.ColorTheme {
    constructor(public readonly kind: ColorThemeKind) { }
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
    export function fromValue(s: string | undefined): TextEditorSelectionChangeKind | undefined {
        switch (s) {
            case 'keyboard': return TextEditorSelectionChangeKind.Keyboard;
            case 'mouse': return TextEditorSelectionChangeKind.Mouse;
            case 'api': return TextEditorSelectionChangeKind.Command;
        }
        return undefined;
    }
}

export enum TextDocumentChangeReason {
    Undo = 1,
    Redo = 2,
}

@es5ClassCompat
export class Position {
    private _line: number;
    private _character: number;
    constructor(line: number, char: number) {
        if (line < 0) {
            throw new Error('line number cannot be negative');
        }
        if (char < 0) {
            throw new Error('char number cannot be negative');
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

    static isPosition(other: unknown): other is Position {
        if (!other) {
            return false;
        }
        if (typeof other !== 'object' || Array.isArray(other)) {
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

    toJSON(): unknown {
        return { line: this.line, character: this.character };
    }
}

@es5ClassCompat
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

    static isRange(arg: unknown): arg is theia.Range {
        if (arg instanceof Range) {
            return true;
        }
        return isObject<theia.Range>(arg)
            && Position.isPosition(arg.start)
            && Position.isPosition(arg.end);
    }

    toJSON(): unknown {
        return [this.start, this.end];
    }
}

@es5ClassCompat
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

export namespace TextDocumentShowOptions {
    /**
     * @param candidate
     * @returns `true` if `candidate` is an instance of options that includes a selection.
     * This function should be used to determine whether TextDocumentOptions passed into commands by plugins
     * need to be translated to TextDocumentShowOptions in the style of the RPC model. Selection is the only field that requires translation.
     */
    export function isTextDocumentShowOptions(candidate: unknown): candidate is theia.TextDocumentShowOptions {
        if (!candidate) {
            return false;
        }
        const options = candidate as theia.TextDocumentShowOptions;
        return Range.isRange(options.selection);
    }
}

export enum EndOfLine {
    LF = 1,
    CRLF = 2
}

export enum EnvironmentVariableMutatorType {
    Replace = 1,
    Append = 2,
    Prepend = 3
}

@es5ClassCompat
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

    appendChoice(values: string[], number: number = this._tabstop++): SnippetString {
        const value = values.map(s => s.replace(/\$|}|\\|,/g, '\\$&')).join(',');
        this.value += `\$\{${number}|${value}|\}`;
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

@es5ClassCompat
export class ThemeColor {
    constructor(public id: string) { }
}

@es5ClassCompat
export class ThemeIcon {

    static readonly File: ThemeIcon = new ThemeIcon('file');

    static readonly Folder: ThemeIcon = new ThemeIcon('folder');

    private constructor(public id: string, public color?: ThemeColor) {
    }

}

export namespace ThemeIcon {
    export function is(item: unknown): item is ThemeIcon {
        return isObject(item) && 'id' in item;
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
    Global = 1,
    Workspace,
    WorkspaceFolder,
    Default,
    Memory
}

@es5ClassCompat
export class RelativePattern {

    private _base!: string;
    get base(): string {
        return this._base;
    }
    set base(base: string) {
        this._base = base;
        this._baseUri = URI.file(base);
    }

    private _baseUri!: URI;
    get baseUri(): URI {
        return this._baseUri;
    }
    set baseUri(baseUri: URI) {
        this._baseUri = baseUri;
        this.base = baseUri.fsPath;
    }

    constructor(base: theia.WorkspaceFolder | URI | string, public pattern: string) {
        if (typeof base !== 'string') {
            if (!base || !URI.isUri(base) && !URI.isUri(base.uri)) {
                throw illegalArgument('base');
            }
        }

        if (typeof pattern !== 'string') {
            throw illegalArgument('pattern');
        }

        if (typeof base === 'string') {
            this.baseUri = URI.file(base);
        } else if (URI.isUri(base)) {
            this.baseUri = base;
        } else {
            this.baseUri = base.uri;
        }
    }

    pathToRelative(from: string, to: string): string {
        return relative(from, to);
    }
}

export enum IndentAction {
    None = 0,
    Indent = 1,
    IndentOutdent = 2,
    Outdent = 3
}

@es5ClassCompat
export class TextEdit {

    protected _range: Range;
    protected _newText: string;
    protected _newEol: EndOfLine;

    get range(): Range {
        return this._range;
    }

    set range(value: Range) {
        if (value && !Range.isRange(value)) {
            throw illegalArgument('range');
        }
        this._range = value;
    }

    get newText(): string {
        return this._newText || '';
    }

    set newText(value: string) {
        if (value && typeof value !== 'string') {
            throw illegalArgument('newText');
        }
        this._newText = value;
    }

    get newEol(): EndOfLine {
        return this._newEol;
    }

    set newEol(value: EndOfLine) {
        if (value && typeof value !== 'number') {
            throw illegalArgument('newEol');
        }
        this._newEol = value;
    }

    constructor(range: Range | undefined, newText: string | undefined) {
        this.range = range!;
        this.newText = newText!;
    }

    static isTextEdit(thing: {}): thing is TextEdit {
        if (thing instanceof TextEdit) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return Range.isRange((<TextEdit>thing).range)
            && typeof (<TextEdit>thing).newText === 'string';
    }

    static replace(range: Range, newText: string): TextEdit {
        return new TextEdit(range, newText);
    }

    static insert(position: Position, newText: string): TextEdit {
        return TextEdit.replace(new Range(position, position), newText);
    }

    static delete(range: Range): TextEdit {
        return TextEdit.replace(range, '');
    }

    static setEndOfLine(eol: EndOfLine): TextEdit {
        const ret = new TextEdit(undefined, undefined);
        ret.newEol = eol;
        return ret;
    }
}

export enum CompletionTriggerKind {
    Invoke = 0,
    TriggerCharacter = 1,
    TriggerForIncompleteCompletions = 2
}

export enum CompletionItemKind {
    Text = 0,
    Method = 1,
    Function = 2,
    Constructor = 3,
    Field = 4,
    Variable = 5,
    Class = 6,
    Interface = 7,
    Module = 8,
    Property = 9,
    Unit = 10,
    Value = 11,
    Enum = 12,
    Keyword = 13,
    Snippet = 14,
    Color = 15, // eslint-disable-line @typescript-eslint/no-shadow
    File = 16,
    Reference = 17,
    Folder = 18,
    EnumMember = 19,
    Constant = 20,
    Struct = 21,
    Event = 22,
    Operator = 23,
    TypeParameter = 24,
    User = 25,
    Issue = 26
}

@es5ClassCompat
export class CompletionItem implements theia.CompletionItem {

    label: string;
    kind?: CompletionItemKind;
    tags?: CompletionItemTag[];
    detail: string;
    documentation: string | theia.MarkdownString;
    sortText: string;
    filterText: string;
    preselect: boolean;
    insertText: string | SnippetString;
    range: Range;
    textEdit: TextEdit;
    additionalTextEdits: TextEdit[];
    command: theia.Command;

    constructor(label: string, kind?: CompletionItemKind) {
        this.label = label;
        this.kind = kind;
    }
}

@es5ClassCompat
export class CompletionList {

    isIncomplete?: boolean;

    items: theia.CompletionItem[];

    constructor(items: theia.CompletionItem[] = [], isIncomplete: boolean = false) {
        this.items = items;
        this.isIncomplete = isIncomplete;
    }
}

export enum InlineCompletionTriggerKind {
    Invoke = 0,
    Automatic = 1,
}

@es5ClassCompat
export class InlineCompletionItem implements theia.InlineCompletionItem {

    filterText?: string;
    insertText: string;
    range?: Range;
    command?: theia.Command;

    constructor(insertText: string, range?: Range, command?: theia.Command) {
        this.insertText = insertText;
        this.range = range;
        this.command = command;
    }
}

@es5ClassCompat
export class InlineCompletionList implements theia.InlineCompletionList {

    items: theia.InlineCompletionItem[];
    commands: theia.Command[] | undefined = undefined;

    constructor(items: theia.InlineCompletionItem[]) {
        this.items = items;
    }
}

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3
}

export enum DebugConsoleMode {
    Separate = 0,
    MergeWithParent = 1
}

@es5ClassCompat
export class Location {
    uri: URI;
    range: Range;

    constructor(uri: URI, rangeOrPosition: Range | Position | undefined) {
        this.uri = uri;
        if (rangeOrPosition instanceof Range) {
            this.range = rangeOrPosition;
        } else if (rangeOrPosition instanceof Position) {
            this.range = new Range(rangeOrPosition, rangeOrPosition);
        }
    }

    static isLocation(thing: {}): thing is theia.Location {
        if (thing instanceof Location) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return Range.isRange((<Location>thing).range)
            && URI.isUri((<Location>thing).uri);
    }
}

@es5ClassCompat
export class DiagnosticRelatedInformation {
    location: Location;
    message: string;

    constructor(location: Location, message: string) {
        this.location = location;
        this.message = message;
    }
}

export enum DiagnosticTag {
    Unnecessary = 1,
    Deprecated = 2,
}

export enum CompletionItemTag {
    Deprecated = 1,
}

@es5ClassCompat
export class Diagnostic {
    range: Range;
    message: string;
    severity: DiagnosticSeverity;
    source?: string;
    code?: string | number;
    relatedInformation?: DiagnosticRelatedInformation[];
    tags?: DiagnosticTag[];

    constructor(range: Range, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
        this.range = range;
        this.message = message;
        this.severity = severity;
    }
}

export enum MarkerSeverity {
    Hint = 1,
    Info = 2,
    Warning = 4,
    Error = 8,
}

export enum MarkerTag {
    Unnecessary = 1,
    Deprecated = 2,
}

export enum NotebookCellKind {
    Markup = 1,
    Code = 2
}

export enum NotebookCellStatusBarAlignment {
    Left = 1,
    Right = 2
}

export enum NotebookControllerAffinity {
    Default = 1,
    Preferred = 2
}

export enum NotebookEditorRevealType {
    Default = 0,
    InCenter = 1,
    InCenterIfOutsideViewport = 2,
    AtTop = 3
}
@es5ClassCompat
export class NotebookCellData implements theia.NotebookCellData {
    languageId: string;
    kind: NotebookCellKind;
    value: string;
    outputs?: theia.NotebookCellOutput[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: { [key: string]: any };
    executionSummary?: theia.NotebookCellExecutionSummary;

    constructor(kind: NotebookCellKind, value: string, languageId: string) {
        this.kind = kind;
        this.value = value;
        this.languageId = languageId;
    }
}

@es5ClassCompat
export class NotebookCellOutput implements theia.NotebookCellOutput {
    items: theia.NotebookCellOutputItem[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: { [key: string]: any };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(items: theia.NotebookCellOutputItem[], metadata?: { [key: string]: any }) {
        this.items = items;
        this.metadata = metadata;
    }
}

export class NotebookCellOutputItem implements theia.NotebookCellOutputItem {
    mime: string;
    data: Uint8Array;

    static #encoder = new TextEncoder();

    static text(value: string, mime?: string): NotebookCellOutputItem {
        const bytes = NotebookCellOutputItem.#encoder.encode(String(value));
        return new NotebookCellOutputItem(bytes, mime || 'text/plain');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static json(value: any, mime?: string): NotebookCellOutputItem {
        const jsonStr = JSON.stringify(value, undefined, '\t');
        return NotebookCellOutputItem.text(jsonStr, mime);
    }

    static stdout(value: string): NotebookCellOutputItem {
        return NotebookCellOutputItem.text(value, 'application/vnd.code.notebook.stdout');
    }

    static stderr(value: string): NotebookCellOutputItem {
        return NotebookCellOutputItem.text(value, 'application/vnd.code.notebook.stderr');
    }

    static error(value: Error): NotebookCellOutputItem {
        return NotebookCellOutputItem.json(value, 'application/vnd.code.notebook.error');
    }

    constructor(data: Uint8Array, mime: string) {
        this.data = data;
        this.mime = mime;
    }
}

@es5ClassCompat
export class NotebookCellStatusBarItem implements theia.NotebookCellStatusBarItem {
    text: string;
    alignment: NotebookCellStatusBarAlignment;
    command?: string | theia.Command;
    tooltip?: string;
    priority?: number;
    accessibilityInformation?: AccessibilityInformation;

    /**
     * Creates a new NotebookCellStatusBarItem.
     * @param text The text to show for the item.
     * @param alignment Whether the item is aligned to the left or right.
     * @stubbed
     */
    constructor(text: string, alignment: NotebookCellStatusBarAlignment) {
        this.text = text;
        this.alignment = alignment;
    }
}

@es5ClassCompat
export class NotebookData implements theia.NotebookData {
    cells: NotebookCellData[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: { [key: string]: any };

    constructor(cells: NotebookCellData[]) {
        this.cells = cells;
    }
}

export class NotebookDocument implements theia.NotebookDocument {
    readonly uri: theia.Uri;
    readonly notebookType: string;
    readonly version: number;
    readonly isDirty: boolean;
    readonly isUntitled: boolean;
    readonly isClosed: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly metadata: { [key: string]: any };
    readonly cellCount: number;

    cellAt(index: number): theia.NotebookCell {
        return {} as theia.NotebookCell;
    }
    save(): theia.Thenable<boolean> {
        return Promise.resolve(false);
    }

    getCells(range?: theia.NotebookRange | undefined): theia.NotebookCell[] {
        return [] as NotebookCell[];
    }
}
export class NotebookCell implements theia.NotebookCell {
    readonly index: number;
    readonly notebook: theia.NotebookDocument;
    readonly kind: theia.NotebookCellKind;
    readonly document: theia.TextDocument;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly metadata: { readonly [key: string]: any; };
    readonly outputs: readonly theia.NotebookCellOutput[];
    readonly executionSummary: theia.NotebookCellExecutionSummary | undefined;

}

export class NotebookRange implements theia.NotebookRange {
    readonly start: number;
    readonly end: number;
    readonly isEmpty: boolean;

    with(change: { start?: number; end?: number }): NotebookRange {
        let newStart = this.start;
        let newEnd = this.end;

        if (change.start !== undefined) {
            newStart = change.start;
        }
        if (change.end !== undefined) {
            newEnd = change.end;
        }
        if (newStart === this.start && newEnd === this.end) {
            return this;
        }
        return new NotebookRange(newStart, newEnd);
    }

    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }

}

export class SnippetTextEdit implements theia.SnippetTextEdit {
    range: Range;
    snippet: SnippetString;

    static isSnippetTextEdit(thing: unknown): thing is SnippetTextEdit {
        return thing instanceof SnippetTextEdit || isObject<SnippetTextEdit>(thing)
            && Range.isRange((<SnippetTextEdit>thing).range)
            && SnippetString.isSnippetString((<SnippetTextEdit>thing).snippet);
    }

    static replace(range: Range, snippet: SnippetString): SnippetTextEdit {
        return new SnippetTextEdit(range, snippet);
    }

    static insert(position: Position, snippet: SnippetString): SnippetTextEdit {
        return SnippetTextEdit.replace(new Range(position, position), snippet);
    }

    constructor(range: Range, snippet: SnippetString) {
        this.range = range;
        this.snippet = snippet;
    }
}

@es5ClassCompat
export class NotebookEdit implements theia.NotebookEdit {
    range: theia.NotebookRange;
    newCells: theia.NotebookCellData[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newCellMetadata?: { [key: string]: any; } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newNotebookMetadata?: { [key: string]: any; } | undefined;

    static replaceCells(range: NotebookRange, newCells: NotebookCellData[]): NotebookEdit {
        return new NotebookEdit();
    }

    static insertCells(index: number, newCells: NotebookCellData[]): NotebookEdit {
        return new NotebookEdit();
    }

    static deleteCells(range: NotebookRange): NotebookEdit {
        return new NotebookEdit();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static updateCellMetadata(index: number, newCellMetadata: { [key: string]: any }): NotebookEdit {
        return new NotebookEdit();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static updateNotebookMetadata(newNotebookMetadata: { [key: string]: any }): NotebookEdit {
        return new NotebookEdit();
    }
}

@es5ClassCompat
export class ParameterInformation {
    label: string | [number, number];
    documentation?: string | theia.MarkdownString;

    constructor(label: string | [number, number], documentation?: string | theia.MarkdownString) {
        this.label = label;
        this.documentation = documentation;
    }
}

@es5ClassCompat
export class SignatureInformation {
    label: string;
    documentation?: string | theia.MarkdownString;
    parameters: ParameterInformation[];
    activeParameter?: number;

    constructor(label: string, documentation?: string | theia.MarkdownString) {
        this.label = label;
        this.documentation = documentation;
        this.parameters = [];
    }
}

export enum SignatureHelpTriggerKind {
    Invoke = 1,
    TriggerCharacter = 2,
    ContentChange = 3,
}

@es5ClassCompat
export class SignatureHelp {
    signatures: SignatureInformation[];
    activeSignature: number;
    activeParameter: number;

    constructor() {
        this.signatures = [];
    }
}

@es5ClassCompat
export class Hover {

    public contents: Array<theia.MarkdownString | theia.MarkedString>;
    public range?: Range;

    constructor(
        contents: theia.MarkdownString | theia.MarkedString | Array<theia.MarkdownString | theia.MarkedString>,
        range?: Range
    ) {
        if (!contents) {
            illegalArgument('contents must be defined');
        }
        if (Array.isArray(contents)) {
            this.contents = contents;
        } else {
            this.contents = [contents];
        }
        this.range = range;
    }
}

@es5ClassCompat
export class EvaluatableExpression {

    public range: Range;
    public expression?: string;

    constructor(
        range: Range,
        expression?: string
    ) {
        if (!range) {
            illegalArgument('range must be defined');
        }
        this.range = range;
        this.expression = expression;
    }
}

@es5ClassCompat
export class InlineValueContext implements theia.InlineValueContext {
    public frameId: number;
    public stoppedLocation: Range;

    constructor(frameId: number, stoppedLocation: Range) {
        if (!frameId) {
            illegalArgument('frameId must be defined');
        }
        if (!stoppedLocation) {
            illegalArgument('stoppedLocation must be defined');
        }
        this.frameId = frameId;
        this.stoppedLocation = stoppedLocation;
    }
}

@es5ClassCompat
export class InlineValueText implements theia.InlineValueText {
    public type = 'text';
    public range: Range;
    public text: string;

    constructor(range: Range, text: string) {
        if (!range) {
            illegalArgument('range must be defined');
        }
        if (!text) {
            illegalArgument('text must be defined');
        }
        this.range = range;
        this.text = text;
    }
}

@es5ClassCompat
export class InlineValueVariableLookup implements theia.InlineValueVariableLookup {
    public type = 'variable';
    public range: Range;
    public variableName?: string;
    public caseSensitiveLookup: boolean;

    constructor(range: Range, variableName?: string, caseSensitiveLookup?: boolean) {
        if (!range) {
            illegalArgument('range must be defined');
        }
        this.range = range;
        this.caseSensitiveLookup = caseSensitiveLookup || true;
        this.variableName = variableName;
    }
}

@es5ClassCompat
export class InlineValueEvaluatableExpression implements theia.InlineValueEvaluatableExpression {
    public type = 'expression';
    public range: Range;
    public expression?: string;

    constructor(range: Range, expression?: string) {
        if (!range) {
            illegalArgument('range must be defined');
        }
        this.range = range;
        this.expression = expression;
    }
}

export type InlineValue = InlineValueText | InlineValueVariableLookup | InlineValueEvaluatableExpression;

export enum DocumentHighlightKind {
    Text = 0,
    Read = 1,
    Write = 2
}

@es5ClassCompat
export class DocumentHighlight {

    public range: Range;
    public kind?: DocumentHighlightKind;

    constructor(
        range: Range,
        kind?: DocumentHighlightKind
    ) {
        this.range = range;
        this.kind = kind;
    }
}

export type Definition = Location | Location[];

@es5ClassCompat
export class DocumentLink {

    range: Range;

    target?: URI;

    tooltip?: string;

    constructor(range: Range, target: URI | undefined) {
        if (target && !(URI.isUri(target))) {
            throw illegalArgument('target');
        }
        if (!Range.isRange(range) || range.isEmpty) {
            throw illegalArgument('range');
        }
        this.range = range;
        this.target = target;
    }
}

@es5ClassCompat
export class DocumentDropEdit {
    insertText: string | SnippetString;

    additionalEdit?: WorkspaceEdit;

    constructor(insertText: string | SnippetString) {
        this.insertText = insertText;
    }
}

@es5ClassCompat
export class CodeLens {

    range: Range;

    command?: theia.Command;

    get isResolved(): boolean {
        return !!this.command;
    }

    constructor(range: Range, command?: theia.Command) {
        this.range = range;
        this.command = command;
    }
}

export enum CodeActionTrigger {
    Automatic = 1,
    Manual = 2,
}

/**
 * The reason why code actions were requested.
 */
export enum CodeActionTriggerKind {
    /**
     * Code actions were explicitly requested by the user or by an extension.
     */
    Invoke = 1,

    /**
     * Code actions were requested automatically.
     *
     * This typically happens when current selection in a file changes, but can
     * also be triggered when file content changes.
     */
    Automatic = 2,
}

@es5ClassCompat
export class CodeActionKind {
    private static readonly sep = '.';

    public static readonly Empty = new CodeActionKind('');
    public static readonly QuickFix = CodeActionKind.Empty.append('quickfix');
    public static readonly Refactor = CodeActionKind.Empty.append('refactor');
    public static readonly RefactorExtract = CodeActionKind.Refactor.append('extract');
    public static readonly RefactorInline = CodeActionKind.Refactor.append('inline');
    public static readonly RefactorMove = CodeActionKind.Refactor.append('move');
    public static readonly RefactorRewrite = CodeActionKind.Refactor.append('rewrite');
    public static readonly Source = CodeActionKind.Empty.append('source');
    public static readonly SourceOrganizeImports = CodeActionKind.Source.append('organizeImports');
    public static readonly SourceFixAll = CodeActionKind.Source.append('fixAll');

    constructor(
        public readonly value: string
    ) { }

    public append(parts: string): CodeActionKind {
        return new CodeActionKind(this.value ? this.value + CodeActionKind.sep + parts : parts);
    }

    public contains(other: CodeActionKind): boolean {
        return this.value === other.value || startsWithIgnoreCase(other.value, this.value + CodeActionKind.sep);
    }

    public intersects(other: CodeActionKind): boolean {
        return this.contains(other) || other.contains(this);
    }
}

export enum TextDocumentSaveReason {
    Manual = 1,
    AfterDelay = 2,
    FocusOut = 3
}

@es5ClassCompat
export class CodeAction {
    title: string;

    command?: theia.Command;

    edit?: WorkspaceEdit;

    diagnostics?: Diagnostic[];

    kind?: CodeActionKind;

    disabled?: { reason: string };

    isPreferred?: boolean;

    constructor(title: string, kind?: CodeActionKind) {
        this.title = title;
        this.kind = kind;
    }
}

export interface FileOperationOptions {
    overwrite?: boolean;
    ignoreIfExists?: boolean;
    ignoreIfNotExists?: boolean;
    recursive?: boolean;
}

// copied from https://github.com/microsoft/vscode/blob/b165e20587dd0797f37251515bc9e4dbe513ede8/src/vs/editor/common/modes.ts
export interface WorkspaceEditMetadata {
    needsConfirmation: boolean;
    label: string;
    description?: string;
    iconPath?: {
        id: string;
    } | {
        light: URI;
        dark: URI;
    } | ThemeIcon;
}

export const enum FileEditType {
    File = 1,
    Text = 2,
    Snippet = 6,
}

export interface FileOperation {
    _type: FileEditType.File;
    from: URI | undefined;
    to: URI | undefined;
    options?: FileOperationOptions;
    metadata?: WorkspaceEditMetadata;
}

export interface FileTextEdit {
    _type: FileEditType.Text;
    uri: URI;
    edit: TextEdit;
    metadata?: WorkspaceEditMetadata;
}

export interface FileSnippetTextEdit {
    readonly _type: FileEditType.Snippet;
    readonly uri: URI;
    readonly range: Range;
    readonly edit: SnippetTextEdit;
    readonly metadata?: theia.WorkspaceEditEntryMetadata;
}

type WorkspaceEditEntry = FileOperation | FileTextEdit | FileSnippetTextEdit | undefined;

@es5ClassCompat
export class WorkspaceEdit implements theia.WorkspaceEdit {

    private _edits = new Array<WorkspaceEditEntry>();

    renameFile(from: theia.Uri, to: theia.Uri, options?: { overwrite?: boolean, ignoreIfExists?: boolean }, metadata?: WorkspaceEditMetadata): void {
        this._edits.push({ _type: 1, from, to, options, metadata });
    }

    createFile(uri: theia.Uri, options?: { overwrite?: boolean, ignoreIfExists?: boolean }, metadata?: WorkspaceEditMetadata): void {
        this._edits.push({ _type: 1, from: undefined, to: uri, options, metadata });
    }

    deleteFile(uri: theia.Uri, options?: { recursive?: boolean, ignoreIfNotExists?: boolean }, metadata?: WorkspaceEditMetadata): void {
        this._edits.push({ _type: 1, from: uri, to: undefined, options, metadata });
    }

    replace(uri: URI, range: Range, newText: string, metadata?: WorkspaceEditMetadata): void {
        this._edits.push({ _type: 2, uri, edit: new TextEdit(range, newText), metadata });
    }

    insert(resource: URI, position: Position, newText: string, metadata?: WorkspaceEditMetadata): void {
        this.replace(resource, new Range(position, position), newText, metadata);
    }

    delete(resource: URI, range: Range, metadata?: WorkspaceEditMetadata): void {
        this.replace(resource, range, '', metadata);
    }

    has(uri: URI): boolean {
        for (const edit of this._edits) {
            if (edit && edit._type === 2 && edit.uri.toString() === uri.toString()) {
                return true;
            }
        }
        return false;
    }

    set(uri: URI, edits: ReadonlyArray<TextEdit | SnippetTextEdit>): void;
    set(uri: URI, edits: ReadonlyArray<[TextEdit | SnippetTextEdit, theia.WorkspaceEditEntryMetadata]>): void;

    set(uri: URI, edits: ReadonlyArray<TextEdit | SnippetTextEdit | [TextEdit | SnippetTextEdit, theia.WorkspaceEditEntryMetadata]>): void {
        if (!edits) {
            // remove all text edits for `uri`
            for (let i = 0; i < this._edits.length; i++) {
                const element = this._edits[i];
                if (element &&
                    (element._type === FileEditType.Text || element._type === FileEditType.Snippet) &&
                    element.uri.toString() === uri.toString()) {
                    this._edits[i] = undefined;
                }
            }
            this._edits = this._edits.filter(e => !!e);
        } else {
            // append edit to the end
            for (const editOrTuple of edits) {
                if (!editOrTuple) {
                    continue;
                }

                let edit: TextEdit | SnippetTextEdit;
                let metadata: theia.WorkspaceEditEntryMetadata | undefined;
                if (Array.isArray(editOrTuple)) {
                    edit = editOrTuple[0];
                    metadata = editOrTuple[1];
                } else {
                    edit = editOrTuple;
                }

                if (SnippetTextEdit.isSnippetTextEdit(edit)) {
                    this._edits.push({ _type: FileEditType.Snippet, uri, range: edit.range, edit, metadata });
                } else {
                    this._edits.push({ _type: FileEditType.Text, uri, edit });
                }
            }
        }
    }

    get(uri: URI): TextEdit[] {
        const res: TextEdit[] = [];
        for (const candidate of this._edits) {
            if (candidate && candidate._type === 2 && candidate.uri.toString() === uri.toString()) {
                res.push(candidate.edit);
            }
        }
        if (res.length === 0) {
            return undefined!;
        }
        return res;
    }

    entries(): [URI, TextEdit[]][] {
        const textEdits = new Map<string, [URI, TextEdit[]]>();
        for (const candidate of this._edits) {
            if (candidate && candidate._type === FileEditType.Text) {
                let textEdit = textEdits.get(candidate.uri.toString());
                if (!textEdit) {
                    textEdit = [candidate.uri, []];
                    textEdits.set(candidate.uri.toString(), textEdit);
                }
                textEdit[1].push(candidate.edit);
            }
        }
        const result: [URI, TextEdit[]][] = [];
        textEdits.forEach(v => result.push(v));
        return result;
    }

    _allEntries(): ([URI, Array<TextEdit | SnippetTextEdit>, theia.WorkspaceEditEntryMetadata] | [URI, URI, FileOperationOptions, WorkspaceEditMetadata])[] {
        const res: ([URI, Array<TextEdit | SnippetTextEdit>, theia.WorkspaceEditEntryMetadata] | [URI, URI, FileOperationOptions, WorkspaceEditMetadata])[] = [];
        for (const edit of this._edits) {
            if (!edit) {
                continue;
            }
            if (edit._type === FileEditType.File) {
                res.push([edit.from!, edit.to!, edit.options!, edit.metadata!]);
            } else {
                res.push([edit.uri, [edit.edit], edit.metadata!]);
            }
        }
        return res;
    }

    get size(): number {
        return this.entries().length;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toJSON(): any {
        return this.entries();
    }
}

export class DataTransferItem {
    asString(): Thenable<string> {
        return Promise.resolve(typeof this.value === 'string' ? this.value : JSON.stringify(this.value));
    }

    asFile(): theia.DataTransferFile | undefined {
        return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(readonly value: any) {
    }
}

/**
 * A map containing a mapping of the mime type of the corresponding transferred data.
 *
 * Drag and drop controllers that implement {@link TreeDragAndDropController.handleDrag `handleDrag`} can add additional mime types to the
 * data transfer. These additional mime types will only be included in the `handleDrop` when the the drag was initiated from
 * an element in the same drag and drop controller.
 */
@es5ClassCompat
export class DataTransfer implements Iterable<[mimeType: string, item: DataTransferItem]> {
    private items = new Map<string, DataTransferItem>();
    get(mimeType: string): DataTransferItem | undefined {
        return this.items.get(mimeType);
    }
    set(mimeType: string, value: DataTransferItem): void {
        this.items.set(mimeType, value);
    }

    has(mimeType: string): boolean {
        return this.items.has(mimeType);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forEach(callbackfn: (item: DataTransferItem, mimeType: string, dataTransfer: DataTransfer) => void, thisArg?: any): void {
        this.items.forEach((item, mimetype) => {
            callbackfn.call(thisArg, item, mimetype, this);
        });
    }
    [Symbol.iterator](): IterableIterator<[mimeType: string, item: DataTransferItem]> {
        return this.items[Symbol.iterator]();
    }

    clear(): void {
        this.items.clear();
    }
}
@es5ClassCompat
export class TreeItem {

    label?: string | theia.TreeItemLabel;

    id?: string;

    iconPath?: string | URI | { light: string | URI; dark: string | URI } | ThemeIcon;

    resourceUri?: URI;

    tooltip?: string | undefined;

    command?: theia.Command;

    contextValue?: string;

    constructor(label: string | theia.TreeItemLabel, collapsibleState?: theia.TreeItemCollapsibleState)
    constructor(resourceUri: URI, collapsibleState?: theia.TreeItemCollapsibleState)
    constructor(arg1: string | theia.TreeItemLabel | URI, public collapsibleState: theia.TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
        if (arg1 instanceof URI) {
            this.resourceUri = arg1;
        } else {
            this.label = arg1;
        }
    }
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2
}

export enum SymbolTag {
    Deprecated = 1
}

@es5ClassCompat
export class SymbolInformation {

    static validate(candidate: SymbolInformation): void {
        if (!candidate.name) {
            throw new Error('Should provide a name inside candidate field');
        }
    }

    name: string;
    location: Location;
    kind: SymbolKind;
    tags?: SymbolTag[];
    containerName: undefined | string;
    constructor(name: string, kind: SymbolKind, containerName: string, location: Location);
    constructor(name: string, kind: SymbolKind, range: Range, uri?: URI, containerName?: string);
    constructor(name: string, kind: SymbolKind, rangeOrContainer: string | Range, locationOrUri?: Location | URI, containerName?: string) {
        this.name = name;
        this.kind = kind;
        this.containerName = containerName;

        if (typeof rangeOrContainer === 'string') {
            this.containerName = rangeOrContainer;
        }

        if (locationOrUri instanceof Location) {
            this.location = locationOrUri;
        } else if (rangeOrContainer instanceof Range) {
            this.location = new Location(locationOrUri!, rangeOrContainer);
        }

        SymbolInformation.validate(this);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toJSON(): any {
        return {
            name: this.name,
            kind: SymbolKind[this.kind],
            location: this.location,
            containerName: this.containerName
        };
    }
}

@es5ClassCompat
export class DocumentSymbol {

    static validate(candidate: DocumentSymbol): void {
        if (!candidate.name) {
            throw new Error('Should provide a name inside candidate field');
        }
        if (!candidate.range.contains(candidate.selectionRange)) {
            throw new Error('selectionRange must be contained in fullRange');
        }
        if (candidate.children) {
            candidate.children.forEach(DocumentSymbol.validate);
        }
    }

    name: string;
    detail: string;
    kind: SymbolKind;
    tags?: SymbolTag[];
    range: Range;
    selectionRange: Range;
    children: DocumentSymbol[];

    constructor(name: string, detail: string, kind: SymbolKind, range: Range, selectionRange: Range) {
        this.name = name;
        this.detail = detail;
        this.kind = kind;
        this.range = range;
        this.selectionRange = selectionRange;
        this.children = [];

        DocumentSymbol.validate(this);
    }
}

export enum CommentThreadState {
    Unresolved = 0,
    Resolved = 1
}

export enum CommentThreadCollapsibleState {
    Collapsed = 0,
    Expanded = 1
}

@es5ClassCompat
export class QuickInputButtons {
    static readonly Back: theia.QuickInputButton = {
        iconPath: {
            id: 'Back',
        },
        tooltip: 'Back'
    };
}

@es5ClassCompat
export class TerminalLink {

    static validate(candidate: TerminalLink): void {
        if (typeof candidate.startIndex !== 'number') {
            throw new Error('Should provide a startIndex inside candidate field');
        }
        if (typeof candidate.length !== 'number') {
            throw new Error('Should provide a length inside candidate field');
        }
    }

    startIndex: number;
    length: number;
    tooltip?: string;

    constructor(startIndex: number, length: number, tooltip?: string) {
        this.startIndex = startIndex;
        this.length = length;
        this.tooltip = tooltip;
    }
}

export enum TerminalLocation {
    Panel = 1,
    Editor = 2
}
export class TerminalProfile {
    /**
     * Creates a new terminal profile.
     * @param options The options that the terminal will launch with.
     */
    constructor(readonly options: theia.TerminalOptions | theia.ExtensionTerminalOptions) {
    }
}

export enum TerminalExitReason {
    Unknown = 0,
    Shutdown = 1,
    Process = 2,
    User = 3,
    Extension = 4,
}

export enum TerminalQuickFixType {
    command = 'command',
    opener = 'opener'
}

@es5ClassCompat
export class FileDecoration {

    static validate(d: FileDecoration): void {
        if (d.badge && d.badge.length !== 1 && d.badge.length !== 2) {
            throw new Error('The \'badge\'-property must be undefined or a short character');
        }
        if (!d.color && !d.badge && !d.tooltip) {
            throw new Error('The decoration is empty');
        }
    }

    badge?: string;
    tooltip?: string;
    color?: theia.ThemeColor;
    priority?: number;
    propagate?: boolean;

    constructor(badge?: string, tooltip?: string, color?: ThemeColor) {
        this.badge = badge;
        this.tooltip = tooltip;
        this.color = color;
    }
}

export enum CommentMode {
    Editing = 0,
    Preview = 1
}

// #region file api

export enum FileChangeType {
    Changed = 1,
    Created = 2,
    Deleted = 3,
}

@es5ClassCompat
export class FileSystemError extends Error {

    static FileExists(messageOrUri?: string | URI): FileSystemError {
        return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileExists, FileSystemError.FileExists);
    }
    static FileNotFound(messageOrUri?: string | URI): FileSystemError {
        return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotFound, FileSystemError.FileNotFound);
    }
    static FileNotADirectory(messageOrUri?: string | URI): FileSystemError {
        return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotADirectory, FileSystemError.FileNotADirectory);
    }
    static FileIsADirectory(messageOrUri?: string | URI): FileSystemError {
        return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileIsADirectory, FileSystemError.FileIsADirectory);
    }
    static NoPermissions(messageOrUri?: string | URI): FileSystemError {
        return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.NoPermissions, FileSystemError.NoPermissions);
    }
    static Unavailable(messageOrUri?: string | URI): FileSystemError {
        return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.Unavailable, FileSystemError.Unavailable);
    }

    readonly code: string;

    constructor(uriOrMessage?: string | URI, code: FileSystemProviderErrorCode = FileSystemProviderErrorCode.Unknown, terminator?: Function) {
        super(URI.isUri(uriOrMessage) ? uriOrMessage.toString(true) : uriOrMessage);

        this.code = terminator?.name ?? 'Unknown';

        // mark the error as file system provider error so that
        // we can extract the error code on the receiving side
        markAsFileSystemProviderError(this, code);

        // workaround when extending builtin objects and when compiling to ES5, see:
        // https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
        if (typeof Object.setPrototypeOf === 'function') {
            Object.setPrototypeOf(this, FileSystemError.prototype);
        }

        if (typeof Error.captureStackTrace === 'function' && typeof terminator === 'function') {
            // nice stack traces
            Error.captureStackTrace(this, terminator);
        }
    }
}

// #endregion

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64
}

export interface FileStat {
    readonly type: FileType;
    readonly ctime: number;
    readonly mtime: number;
    readonly size: number;
}

@es5ClassCompat
export class ProgressOptions {
    /**
     * The location at which progress should show.
     */
    location: ProgressLocation;
    /**
     * A human-readable string which will be used to describe the
     * operation.
     */
    title?: string;
    /**
     * Controls if a cancel button should show to allow the user to
     * cancel the long running operation.  Note that currently only
     * `ProgressLocation.Notification` is supporting to show a cancel
     * button.
     */
    cancellable?: boolean;
    constructor(location: ProgressLocation, title?: string, cancellable?: boolean) {
        this.location = location;
    }
}

@es5ClassCompat
export class Progress<T> {
    /**
     * Report a progress update.
     * @param value A progress item, like a message and/or an
     * report on how much work finished
     */
    report(value: T): void {
    }
}
export enum ProgressLocation {
    /**
     * Show progress for the source control viewlet, as overlay for the icon and as progress bar
     * inside the viewlet (when visible). Neither supports cancellation nor discrete progress.
     */
    SourceControl = 1,
    /**
     * Show progress in the status bar of the editor. Neither supports cancellation nor discrete progress.
     */
    Window = 10,
    /**
     * Show progress as notification with an optional cancel button. Supports to show infinite and discrete progress.
     */
    Notification = 15
}

@es5ClassCompat
export class ProcessExecution {
    private executionProcess: string;
    private arguments: string[];
    private executionOptions: theia.ProcessExecutionOptions | undefined;

    constructor(process: string, options?: theia.ProcessExecutionOptions);
    constructor(process: string, args: string[], options?: theia.ProcessExecutionOptions);
    constructor(process: string, varg1?: string[] | theia.ProcessExecutionOptions, varg2?: theia.ProcessExecutionOptions) {
        if (typeof process !== 'string') {
            throw illegalArgument('process');
        }
        this.executionProcess = process;
        if (varg1 !== undefined) {
            if (Array.isArray(varg1)) {
                this.arguments = varg1;
                this.executionOptions = varg2;
            } else {
                this.executionOptions = varg1;
            }
        }
        if (this.arguments === undefined) {
            this.arguments = [];
        }
    }

    get process(): string {
        return this.executionProcess;
    }

    set process(value: string) {
        if (typeof value !== 'string') {
            throw illegalArgument('process');
        }
        this.executionProcess = value;
    }

    get args(): string[] {
        return this.arguments;
    }

    set args(value: string[]) {
        if (!Array.isArray(value)) {
            value = [];
        }
        this.arguments = value;
    }

    get options(): theia.ProcessExecutionOptions | undefined {
        return this.executionOptions;
    }

    set options(value: theia.ProcessExecutionOptions | undefined) {
        this.executionOptions = value;
    }

    public static is(value: theia.ShellExecution | theia.ProcessExecution | theia.CustomExecution): value is ProcessExecution {
        const candidate = value as ProcessExecution;
        return candidate && !!candidate.process;
    }
}

export enum QuickPickItemKind {
    Separator = -1,
    Default = 0,
}

export enum ShellQuoting {
    Escape = 1,
    Strong = 2,
    Weak = 3
}

export enum TaskPanelKind {
    Shared = 1,
    Dedicated = 2,
    New = 3
}

export enum TaskRevealKind {
    Always = 1,
    Silent = 2,
    Never = 3
}

@es5ClassCompat
export class ShellExecution {
    private shellCommandLine: string;
    private shellCommand: string | theia.ShellQuotedString;
    private arguments: (string | theia.ShellQuotedString)[];
    private shellOptions: theia.ShellExecutionOptions | undefined;

    constructor(commandLine: string, options?: theia.ShellExecutionOptions);
    constructor(command: string | theia.ShellQuotedString, args: (string | theia.ShellQuotedString)[], options?: theia.ShellExecutionOptions);

    constructor(arg0: string | theia.ShellQuotedString, arg1?: theia.ShellExecutionOptions | (string | theia.ShellQuotedString)[], arg2?: theia.ShellExecutionOptions) {
        if (Array.isArray(arg1) || typeof arg1 === 'string') {
            if (!arg0) {
                throw illegalArgument('command can\'t be undefined or null');
            }
            if (typeof arg0 !== 'string' && typeof arg0.value !== 'string') {
                throw illegalArgument('command');
            }
            this.shellCommand = arg0;
            this.arguments = arg1 as (string | theia.ShellQuotedString)[];
            this.shellOptions = arg2;
        } else {
            if (typeof arg0 !== 'string') {
                throw illegalArgument('commandLine');
            }
            this.shellCommandLine = arg0;
            this.shellOptions = arg1;
        }
    }

    get commandLine(): string {
        return this.shellCommandLine;
    }

    set commandLine(value: string) {
        if (typeof value !== 'string') {
            throw illegalArgument('commandLine');
        }
        this.shellCommandLine = value;
    }

    get command(): string | theia.ShellQuotedString {
        return this.shellCommand;
    }

    set command(value: string | theia.ShellQuotedString) {
        if (typeof value !== 'string' && typeof value.value !== 'string') {
            throw illegalArgument('command');
        }
        this.shellCommand = value;
    }

    get args(): (string | theia.ShellQuotedString)[] {
        return this.arguments;
    }

    set args(value: (string | theia.ShellQuotedString)[]) {
        this.arguments = value || [];
    }

    get options(): theia.ShellExecutionOptions | undefined {
        return this.shellOptions;
    }

    set options(value: theia.ShellExecutionOptions | undefined) {
        this.shellOptions = value;
    }

    public static is(value: theia.ShellExecution | theia.ProcessExecution | theia.CustomExecution): value is ShellExecution {
        const candidate = value as ShellExecution;
        return candidate && (!!candidate.commandLine || !!candidate.command);
    }
}

@es5ClassCompat
export class CustomExecution {
    private _callback: (resolvedDefinition: theia.TaskDefinition) => Thenable<theia.Pseudoterminal>;
    constructor(callback: (resolvedDefinition: theia.TaskDefinition) => Thenable<theia.Pseudoterminal>) {
        this._callback = callback;
    }

    public set callback(value: (resolvedDefinition: theia.TaskDefinition) => Thenable<theia.Pseudoterminal>) {
        this._callback = value;
    }

    public get callback(): ((resolvedDefinition: theia.TaskDefinition) => Thenable<theia.Pseudoterminal>) {
        return this._callback;
    }

    public static is(value: theia.ShellExecution | theia.ProcessExecution | theia.CustomExecution): value is CustomExecution {
        const candidate = value as CustomExecution;
        return candidate && (!!candidate._callback);
    }
}

@es5ClassCompat
export class TaskGroup {

    public static Clean: TaskGroup = new TaskGroup('clean', 'Clean');
    public static Build: TaskGroup = new TaskGroup('build', 'Build');
    public static Rebuild: TaskGroup = new TaskGroup('rebuild', 'Rebuild');
    public static Test: TaskGroup = new TaskGroup('test', 'Test');

    public static from(value: string): TaskGroup | undefined {
        switch (value) {
            case 'clean':
                return TaskGroup.Clean;
            case 'build':
                return TaskGroup.Build;
            case 'rebuild':
                return TaskGroup.Rebuild;
            case 'test':
                return TaskGroup.Test;
            default:
                return undefined;
        }
    }

    constructor(id: 'clean' | 'build' | 'rebuild' | 'test', label: string);
    constructor(id: 'clean' | 'build' | 'rebuild' | 'test', label: string, isDefault?: boolean | undefined);
    constructor(readonly id: 'clean' | 'build' | 'rebuild' | 'test', label: string, isDefault?: boolean | undefined) {
        this.isDefault = !!isDefault;
    }

    readonly isDefault: boolean;
}

export enum TaskScope {
    Global = 1,
    Workspace = 2
}

@es5ClassCompat
export class Task {
    private taskDefinition: theia.TaskDefinition;
    private taskScope: theia.TaskScope.Global | theia.TaskScope.Workspace | theia.WorkspaceFolder | undefined;
    private taskName: string;
    private taskExecution: ProcessExecution | ShellExecution | CustomExecution | undefined;
    private taskProblemMatchers: string[];
    private hasTaskProblemMatchers: boolean;
    private isTaskBackground: boolean;
    private taskSource: string;
    private taskGroup: TaskGroup | undefined;
    private taskPresentationOptions: theia.TaskPresentationOptions;
    private taskRunOptions: theia.RunOptions;
    constructor(
        taskDefinition: theia.TaskDefinition,
        scope: theia.WorkspaceFolder | theia.TaskScope.Global | theia.TaskScope.Workspace,
        name: string,
        source: string,
        execution?: ProcessExecution | ShellExecution | CustomExecution,
        problemMatchers?: string | string[]
    );

    // Deprecated constructor used by Jake vscode built-in
    constructor(
        taskDefinition: theia.TaskDefinition,
        name: string,
        source: string,
        execution?: ProcessExecution | ShellExecution | CustomExecution,
        problemMatchers?: string | string[],
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
        let taskDefinition: theia.TaskDefinition;
        let scope: theia.WorkspaceFolder | theia.TaskScope.Global | theia.TaskScope.Workspace | undefined;
        let name: string;
        let source: string;
        let execution: ProcessExecution | ShellExecution | CustomExecution | undefined;
        let problemMatchers: string | string[] | undefined;

        if (typeof args[1] === 'string') {
            [
                taskDefinition,
                name,
                source,
                execution,
                problemMatchers,
            ] = args;
        } else {
            [
                taskDefinition,
                scope,
                name,
                source,
                execution,
                problemMatchers,
            ] = args;
        }

        this.definition = taskDefinition;
        this.scope = scope;
        this.name = name;
        this.source = source;
        this.execution = execution;

        if (typeof problemMatchers === 'string') {
            this.taskProblemMatchers = [problemMatchers];
            this.hasTaskProblemMatchers = true;
        } else if (Array.isArray(problemMatchers)) {
            this.taskProblemMatchers = problemMatchers;
            this.hasTaskProblemMatchers = true;
        } else {
            this.taskProblemMatchers = [];
            this.hasTaskProblemMatchers = false;
        }
        this.isTaskBackground = false;
        this.presentationOptions = Object.create(null);
        this.taskRunOptions = Object.create(null);
    }

    get definition(): theia.TaskDefinition {
        return this.taskDefinition;
    }

    set definition(value: theia.TaskDefinition) {
        if (value === undefined || value === null) {
            throw illegalArgument('Kind can\'t be undefined or null');
        }
        this.taskDefinition = value;
    }

    get scope(): theia.TaskScope.Global | theia.TaskScope.Workspace | theia.WorkspaceFolder | undefined {
        return this.taskScope;
    }

    set scope(value: theia.TaskScope.Global | theia.TaskScope.Workspace | theia.WorkspaceFolder | undefined) {
        if (value === null) {
            value = undefined;
        }
        this.taskScope = value;
    }

    get name(): string {
        return this.taskName;
    }

    set name(value: string) {
        if (typeof value !== 'string') {
            throw illegalArgument('name');
        }
        this.taskName = value;
    }

    get execution(): ProcessExecution | ShellExecution | CustomExecution | undefined {
        return this.taskExecution;
    }

    set execution(value: ProcessExecution | ShellExecution | CustomExecution | undefined) {
        if (value === null) {
            value = undefined;
        }
        this.taskExecution = value;
    }

    get problemMatchers(): string[] {
        return this.taskProblemMatchers;
    }

    set problemMatchers(value: string[]) {
        if (!Array.isArray(value)) {
            this.taskProblemMatchers = [];
            this.hasTaskProblemMatchers = false;
            return;
        }
        this.taskProblemMatchers = value;
        this.hasTaskProblemMatchers = true;
    }

    get hasProblemMatchers(): boolean {
        return this.hasTaskProblemMatchers;
    }

    get isBackground(): boolean {
        return this.isTaskBackground;
    }

    set isBackground(value: boolean) {
        if (value !== true && value !== false) {
            value = false;
        }
        this.isTaskBackground = value;
    }

    get source(): string {
        return this.taskSource;
    }

    set source(value: string) {
        if (typeof value !== 'string' || value.length === 0) {
            throw illegalArgument('source must be a string of length > 0');
        }
        this.taskSource = value;
    }

    get group(): TaskGroup | undefined {
        return this.taskGroup;
    }

    set group(value: TaskGroup | undefined) {
        if (value === undefined || value === null) {
            this.taskGroup = undefined;
            return;
        }
        this.taskGroup = value;
    }

    get presentationOptions(): theia.TaskPresentationOptions {
        return this.taskPresentationOptions;
    }

    set presentationOptions(value: theia.TaskPresentationOptions) {
        if (value === null || value === undefined) {
            value = Object.create(null);
        }
        this.taskPresentationOptions = value;
    }

    get runOptions(): theia.RunOptions {
        return this.taskRunOptions;
    }

    set runOptions(value: theia.RunOptions) {
        if (value === null || value === undefined) {
            value = Object.create(null);
        }
        this.taskRunOptions = value;
    }
}

@es5ClassCompat
export class Task2 extends Task { }

@es5ClassCompat
export class DebugAdapterExecutable {
    /**
     * The command or path of the debug adapter executable.
     * A command must be either an absolute path of an executable or the name of an command to be looked up via the PATH environment variable.
     * The special value 'node' will be mapped to VS Code's built-in Node.js runtime.
     */
    readonly command: string;

    /**
     * The arguments passed to the debug adapter executable. Defaults to an empty array.
     */
    readonly args?: string[];

    /**
     * Optional options to be used when the debug adapter is started.
     * Defaults to undefined.
     */
    readonly options?: theia.DebugAdapterExecutableOptions;

    /**
     * Creates a description for a debug adapter based on an executable program.
     *
     * @param command The command or executable path that implements the debug adapter.
     * @param args Optional arguments to be passed to the command or executable.
     * @param options Optional options to be used when starting the command or executable.
     */
    constructor(command: string, args?: string[], options?: theia.DebugAdapterExecutableOptions) {
        this.command = command;
        this.args = args;
        this.options = options;
    }
}

export namespace DebugAdapterExecutable {
    export function is(adapter: theia.DebugAdapterDescriptor | undefined): adapter is theia.DebugAdapterExecutable {
        return !!adapter && 'command' in adapter;
    }
}

/**
 * Represents a debug adapter running as a socket based server.
 */
@es5ClassCompat
export class DebugAdapterServer {

    /**
     * The port.
     */
    readonly port: number;

    /**
     * The host.
     */
    readonly host?: string;

    /**
     * Create a description for a debug adapter running as a socket based server.
     */
    constructor(port: number, host?: string) {
        this.port = port;
        this.host = host;
    }
}

export namespace DebugAdapterServer {
    export function is(adapter: theia.DebugAdapterDescriptor | undefined): adapter is DebugAdapterServer {
        return !!adapter && 'port' in adapter;
    }
}

/**
 * Represents a debug adapter running as a Named Pipe (on Windows)/UNIX Domain Socket (on non-Windows) based server.
 */
@es5ClassCompat
export class DebugAdapterNamedPipeServer {
    /**
     * Create a description for a debug adapter running as a Named Pipe (on Windows)/UNIX Domain Socket (on non-Windows) based server.
     */
    constructor(readonly path: string) { }
}

export namespace DebugAdapterNamedPipeServer {
    export function is(adapter: theia.DebugAdapterDescriptor | undefined): adapter is DebugAdapterNamedPipeServer {
        return !!adapter && 'path' in adapter;
    }
}

/**
 * A debug adapter descriptor for an inline implementation.
 */
@es5ClassCompat
export class DebugAdapterInlineImplementation {
    implementation: theia.DebugAdapter;

    /**
     * Create a descriptor for an inline implementation of a debug adapter.
     */
    constructor(impl: theia.DebugAdapter) {
        this.implementation = impl;
    }
}

export namespace DebugAdapterInlineImplementation {
    export function is(adapter: theia.DebugAdapterDescriptor | undefined): adapter is DebugAdapterInlineImplementation {
        return !!adapter && 'implementation' in adapter;
    }
}

export type DebugAdapterDescriptor = DebugAdapterExecutable | DebugAdapterServer | DebugAdapterNamedPipeServer | DebugAdapterInlineImplementation;

export enum LogLevel {
    Off = 0,
    Trace = 1,
    Debug = 2,
    Info = 3,
    Warning = 4,
    Error = 5
}

/**
 * The base class of all breakpoint types.
 */
@es5ClassCompat
export class Breakpoint {
    /**
     * Is breakpoint enabled.
     */
    enabled: boolean;
    /**
     * An optional expression for conditional breakpoints.
     */
    condition?: string;
    /**
     * An optional expression that controls how many hits of the breakpoint are ignored.
     */
    hitCondition?: string;
    /**
     * An optional message that gets logged when this breakpoint is hit. Embedded expressions within {} are interpolated by the debug adapter.
     */
    logMessage?: string;

    protected constructor(enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string, id?: string) {
        this.enabled = enabled || false;
        this.condition = condition;
        this.hitCondition = hitCondition;
        this.logMessage = logMessage;
        this._id = id;
    }

    private _id: string | undefined;
    /**
     * The unique ID of the breakpoint.
     */
    get id(): string {
        if (!this._id) {
            this._id = UUID.uuid4();
        }
        return this._id;
    }

}

/**
 * A breakpoint specified by a source location.
 */
@es5ClassCompat
export class SourceBreakpoint extends Breakpoint {
    /**
     * The source and line position of this breakpoint.
     */
    location: Location;

    /**
     * Create a new breakpoint for a source location.
     */
    constructor(location: Location, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string, id?: string) {
        super(enabled, condition, hitCondition, logMessage, id);
        this.location = location;
    }
}

/**
 * A breakpoint specified by a function name.
 */
@es5ClassCompat
export class FunctionBreakpoint extends Breakpoint {
    /**
     * The name of the function to which this breakpoint is attached.
     */
    functionName: string;

    /**
     * Create a new function breakpoint.
     */
    constructor(functionName: string, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string, id?: string) {
        super(enabled, condition, hitCondition, logMessage, id);
        this.functionName = functionName;
    }
}

@es5ClassCompat
export class Color {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;

    constructor(red: number, green: number, blue: number, alpha: number) {
        this.red = red;
        this.green = green;
        this.blue = blue;
        this.alpha = alpha;
    }
}

@es5ClassCompat
export class ColorInformation {
    range: Range;
    color: Color;

    constructor(range: Range, color: Color) {
        if (color && !(color instanceof Color)) {
            throw illegalArgument('color');
        }
        if (!Range.isRange(range)) {
            throw illegalArgument('range');
        }
        this.range = range;
        this.color = color;
    }
}

@es5ClassCompat
export class ColorPresentation {
    label: string;
    textEdit?: TextEdit;
    additionalTextEdits?: TextEdit[];

    constructor(label: string) {
        if (!label || typeof label !== 'string') {
            throw illegalArgument('label');
        }
        this.label = label;
    }
}

export enum ColorFormat {
    RGB = 0,
    HEX = 1,
    HSL = 2
}

@es5ClassCompat
export class InlayHintLabelPart implements theia.InlayHintLabelPart {
    value: string;
    tooltip?: string | theia.MarkdownString | undefined;
    location?: Location | undefined;
    command?: theia.Command | undefined;

    constructor(value: string) {
        this.value = value;
    }
}

@es5ClassCompat
export class InlayHint implements theia.InlayHint {
    position: theia.Position;
    label: string | InlayHintLabelPart[];
    tooltip?: string | theia.MarkdownString | undefined;
    kind?: InlayHintKind;
    textEdits?: TextEdit[];
    paddingLeft?: boolean;
    paddingRight?: boolean;

    constructor(position: theia.Position, label: string | InlayHintLabelPart[], kind?: InlayHintKind) {
        this.position = position;
        this.label = label;
        this.kind = kind;
    }
}

export enum InlayHintKind {
    Type = 1,
    Parameter = 2,
}

@es5ClassCompat
export class FoldingRange {
    start: number;
    end: number;
    kind?: FoldingRangeKind;

    constructor(start: number, end: number, kind?: FoldingRangeKind) {
        this.start = start;
        this.end = end;
        this.kind = kind;
    }
}

export enum FoldingRangeKind {
    Comment = 1,
    Imports = 2,
    Region = 3
}

@es5ClassCompat
export class SelectionRange {

    range: Range;
    parent?: SelectionRange;

    constructor(range: Range, parent?: SelectionRange) {
        this.range = range;
        this.parent = parent;

        if (parent && !parent.range.contains(this.range)) {
            throw new Error('Invalid argument: parent must contain this range');
        }
    }
}

/**
 * Enumeration of the supported operating systems.
 */
export enum OperatingSystem {
    Windows = 'Windows',
    Linux = 'Linux',
    OSX = 'OSX'
}

/** The areas of the application shell where webview panel can reside. */
export enum WebviewPanelTargetArea {
    Main = 'main',
    Left = 'left',
    Right = 'right',
    Bottom = 'bottom'
}

/**
 * Possible kinds of UI that can use extensions.
 */
export enum UIKind {

    /**
     * Extensions are accessed from a desktop application.
     */
    Desktop = 1,

    /**
     * Extensions are accessed from a web browser.
     */
    Web = 2
}

@es5ClassCompat
export class CallHierarchyItem {
    _sessionId?: string;
    _itemId?: string;

    kind: SymbolKind;
    name: string;
    detail?: string;
    uri: URI;
    range: Range;
    selectionRange: Range;
    tags?: readonly SymbolTag[];

    constructor(kind: SymbolKind, name: string, detail: string, uri: URI, range: Range, selectionRange: Range) {
        this.kind = kind;
        this.name = name;
        this.detail = detail;
        this.uri = uri;
        this.range = range;
        this.selectionRange = selectionRange;
    }

    static isCallHierarchyItem(thing: {}): thing is CallHierarchyItem {
        if (thing instanceof CallHierarchyItem) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return typeof (<CallHierarchyItem>thing).kind === 'number' &&
            typeof (<CallHierarchyItem>thing).name === 'string' &&
            URI.isUri((<CallHierarchyItem>thing).uri) &&
            Range.isRange((<CallHierarchyItem>thing).range) &&
            Range.isRange((<CallHierarchyItem>thing).selectionRange);
    }
}

@es5ClassCompat
export class CallHierarchyIncomingCall {

    from: theia.CallHierarchyItem;
    fromRanges: theia.Range[];

    constructor(item: CallHierarchyItem, fromRanges: Range[]) {
        this.fromRanges = fromRanges;
        this.from = item;
    }
}

@es5ClassCompat
export class CallHierarchyOutgoingCall {

    to: theia.CallHierarchyItem;
    fromRanges: theia.Range[];

    constructor(item: CallHierarchyItem, fromRanges: Range[]) {
        this.fromRanges = fromRanges;
        this.to = item;
    }
}

@es5ClassCompat
export class TypeHierarchyItem {
    _sessionId?: string;
    _itemId?: string;

    kind: SymbolKind;
    tags?: readonly SymbolTag[];
    name: string;
    detail?: string;
    uri: URI;
    range: Range;
    selectionRange: Range;

    constructor(kind: SymbolKind, name: string, detail: string, uri: URI, range: Range, selectionRange: Range) {
        this.kind = kind;
        this.name = name;
        this.detail = detail;
        this.uri = uri;
        this.range = range;
        this.selectionRange = selectionRange;
    }

    static isTypeHierarchyItem(thing: {}): thing is TypeHierarchyItem {
        if (thing instanceof TypeHierarchyItem) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return typeof (<TypeHierarchyItem>thing).kind === 'number' &&
            typeof (<TypeHierarchyItem>thing).name === 'string' &&
            URI.isUri((<TypeHierarchyItem>thing).uri) &&
            Range.isRange((<TypeHierarchyItem>thing).range) &&
            Range.isRange((<TypeHierarchyItem>thing).selectionRange);
    }
}

export enum LanguageStatusSeverity {
    Information = 0,
    Warning = 1,
    Error = 2
}

@es5ClassCompat
export class LinkedEditingRanges {

    ranges: theia.Range[];
    wordPattern?: RegExp;

    constructor(ranges: Range[], wordPattern?: RegExp) {
        this.ranges = ranges;
        this.wordPattern = wordPattern;
    }
}

export enum TestRunProfileKind {
    Run = 1,
    Debug = 2,
    Coverage = 3,
}

@es5ClassCompat
export class TestTag implements theia.TestTag {
    constructor(public readonly id: string) { }
}

@es5ClassCompat
export class TestRunRequest implements theia.TestRunRequest {
    constructor(
        public readonly include: theia.TestItem[] | undefined = undefined,
        public readonly exclude: theia.TestItem[] | undefined = undefined,
        public readonly profile: theia.TestRunProfile | undefined = undefined,
        public readonly continuous: boolean | undefined = undefined,
    ) { }
}

@es5ClassCompat
export class TestMessage implements theia.TestMessage {
    public expectedOutput?: string;
    public actualOutput?: string;
    public location?: theia.Location;

    public static diff(message: string | theia.MarkdownString, expected: string, actual: string): theia.TestMessage {
        const msg = new TestMessage(message);
        msg.expectedOutput = expected;
        msg.actualOutput = actual;
        return msg;
    }

    constructor(public message: string | theia.MarkdownString) { }
}

@es5ClassCompat
export class TimelineItem {
    timestamp: number;
    label: string;
    id?: string;
    iconPath?: theia.Uri | { light: theia.Uri; dark: theia.Uri } | ThemeIcon;
    description?: string;
    detail?: string;
    command?: theia.Command;
    contextValue?: string;
    constructor(label: string, timestamp: number) {
        this.label = label;
        this.timestamp = timestamp;
    }
}

// #region Semantic Coloring

@es5ClassCompat
export class SemanticTokensLegend {
    public readonly tokenTypes: string[];
    public readonly tokenModifiers: string[];

    constructor(tokenTypes: string[], tokenModifiers: string[] = []) {
        this.tokenTypes = tokenTypes;
        this.tokenModifiers = tokenModifiers;
    }
}

function isStrArrayOrUndefined(arg: unknown): arg is string[] | undefined {
    return typeof arg === 'undefined' || isStringArray(arg);
}

@es5ClassCompat
export class SemanticTokensBuilder {

    private _prevLine: number;
    private _prevChar: number;
    private _dataIsSortedAndDeltaEncoded: boolean;
    private _data: number[];
    private _dataLen: number;
    private _tokenTypeStrToInt: Map<string, number>;
    private _tokenModifierStrToInt: Map<string, number>;
    private _hasLegend: boolean;

    constructor(legend?: SemanticTokensLegend) {
        this._prevLine = 0;
        this._prevChar = 0;
        this._dataIsSortedAndDeltaEncoded = true;
        this._data = [];
        this._dataLen = 0;
        this._tokenTypeStrToInt = new Map<string, number>();
        this._tokenModifierStrToInt = new Map<string, number>();
        this._hasLegend = false;
        if (legend) {
            this._hasLegend = true;
            for (let i = 0, len = legend.tokenTypes.length; i < len; i++) {
                this._tokenTypeStrToInt.set(legend.tokenTypes[i], i);
            }
            for (let i = 0, len = legend.tokenModifiers.length; i < len; i++) {
                this._tokenModifierStrToInt.set(legend.tokenModifiers[i], i);
            }
        }
    }

    public push(line: number, char: number, length: number, tokenType: number, tokenModifiers?: number): void;
    public push(range: Range, tokenType: string, tokenModifiers?: string[]): void;
    public push(arg0: number | Range, arg1: number | string, arg2?: number | string[], arg3?: number, arg4?: number): void {
        if (typeof arg0 === 'number' && typeof arg1 === 'number' && typeof arg2 === 'number' && typeof arg3 === 'number' &&
            (typeof arg4 === 'number' || typeof arg4 === 'undefined')) {
            if (typeof arg4 === 'undefined') {
                arg4 = 0;
            }
            // 1st overload
            return this._pushEncoded(arg0, arg1, arg2, arg3, arg4);
        }
        if (Range.isRange(arg0) && typeof arg1 === 'string' && isStrArrayOrUndefined(arg2)) {
            // 2nd overload
            return this._push(arg0, arg1, arg2);
        }
        throw illegalArgument();
    }

    private _push(range: theia.Range, tokenType: string, tokenModifiers?: string[]): void {
        if (!this._hasLegend) {
            throw new Error('Legend must be provided in constructor');
        }
        if (range.start.line !== range.end.line) {
            throw new Error('`range` cannot span multiple lines');
        }
        if (!this._tokenTypeStrToInt.has(tokenType)) {
            throw new Error('`tokenType` is not in the provided legend');
        }
        const line = range.start.line;
        const char = range.start.character;
        const length = range.end.character - range.start.character;
        const nTokenType = this._tokenTypeStrToInt.get(tokenType)!;
        let nTokenModifiers = 0;
        if (tokenModifiers) {
            for (const tokenModifier of tokenModifiers) {
                if (!this._tokenModifierStrToInt.has(tokenModifier)) {
                    throw new Error('`tokenModifier` is not in the provided legend');
                }
                const nTokenModifier = this._tokenModifierStrToInt.get(tokenModifier)!;
                nTokenModifiers |= (1 << nTokenModifier) >>> 0;
            }
        }
        this._pushEncoded(line, char, length, nTokenType, nTokenModifiers);
    }

    private _pushEncoded(line: number, char: number, length: number, tokenType: number, tokenModifiers: number): void {
        if (this._dataIsSortedAndDeltaEncoded && (line < this._prevLine || (line === this._prevLine && char < this._prevChar))) {
            // push calls were ordered and are no longer ordered
            this._dataIsSortedAndDeltaEncoded = false;

            // Remove delta encoding from data
            const tokenCount = (this._data.length / 5) | 0;
            let prevLine = 0;
            let prevChar = 0;
            for (let i = 0; i < tokenCount; i++) {
                // eslint-disable-next-line @typescript-eslint/no-shadow
                let line = this._data[5 * i];
                // eslint-disable-next-line @typescript-eslint/no-shadow
                let char = this._data[5 * i + 1];

                if (line === 0) {
                    // on the same line as previous token
                    line = prevLine;
                    char += prevChar;
                } else {
                    // on a different line than previous token
                    line += prevLine;
                }

                this._data[5 * i] = line;
                this._data[5 * i + 1] = char;

                prevLine = line;
                prevChar = char;
            }
        }

        let pushLine = line;
        let pushChar = char;
        if (this._dataIsSortedAndDeltaEncoded && this._dataLen > 0) {
            pushLine -= this._prevLine;
            if (pushLine === 0) {
                pushChar -= this._prevChar;
            }
        }

        this._data[this._dataLen++] = pushLine;
        this._data[this._dataLen++] = pushChar;
        this._data[this._dataLen++] = length;
        this._data[this._dataLen++] = tokenType;
        this._data[this._dataLen++] = tokenModifiers;

        this._prevLine = line;
        this._prevChar = char;
    }

    private static _sortAndDeltaEncode(data: number[]): Uint32Array {
        const pos: number[] = [];
        const tokenCount = (data.length / 5) | 0;
        for (let i = 0; i < tokenCount; i++) {
            pos[i] = i;
        }
        pos.sort((a, b) => {
            const aLine = data[5 * a];
            const bLine = data[5 * b];
            if (aLine === bLine) {
                const aChar = data[5 * a + 1];
                const bChar = data[5 * b + 1];
                return aChar - bChar;
            }
            return aLine - bLine;
        });
        const result = new Uint32Array(data.length);
        let prevLine = 0;
        let prevChar = 0;
        for (let i = 0; i < tokenCount; i++) {
            const srcOffset = 5 * pos[i];
            const line = data[srcOffset + 0];
            const char = data[srcOffset + 1];
            const length = data[srcOffset + 2];
            const tokenType = data[srcOffset + 3];
            const tokenModifiers = data[srcOffset + 4];

            const pushLine = line - prevLine;
            const pushChar = (pushLine === 0 ? char - prevChar : char);

            const dstOffset = 5 * i;
            result[dstOffset + 0] = pushLine;
            result[dstOffset + 1] = pushChar;
            result[dstOffset + 2] = length;
            result[dstOffset + 3] = tokenType;
            result[dstOffset + 4] = tokenModifiers;

            prevLine = line;
            prevChar = char;
        }

        return result;
    }

    public build(resultId?: string): SemanticTokens {
        if (!this._dataIsSortedAndDeltaEncoded) {
            return new SemanticTokens(SemanticTokensBuilder._sortAndDeltaEncode(this._data), resultId);
        }
        return new SemanticTokens(new Uint32Array(this._data), resultId);
    }
}

@es5ClassCompat
export class SemanticTokens {
    readonly resultId: string | undefined;
    readonly data: Uint32Array;

    constructor(data: Uint32Array, resultId?: string) {
        this.resultId = resultId;
        this.data = data;
    }
}

@es5ClassCompat
export class SemanticTokensEdit {
    readonly start: number;
    readonly deleteCount: number;
    readonly data: Uint32Array | undefined;

    constructor(start: number, deleteCount: number, data?: Uint32Array) {
        this.start = start;
        this.deleteCount = deleteCount;
        this.data = data;
    }
}

@es5ClassCompat
export class SemanticTokensEdits {
    readonly resultId: string | undefined;
    readonly edits: SemanticTokensEdit[];

    constructor(edits: SemanticTokensEdit[], resultId?: string) {
        this.resultId = resultId;
        this.edits = edits;
    }
}

export enum InputBoxValidationSeverity {
    Info = 1,
    Warning = 2,
    Error = 3
}

// #endregion

// #region Tab Inputs

export class TextTabInput {
    constructor(readonly uri: URI) { }
}

export class TextDiffTabInput {
    constructor(readonly original: URI, readonly modified: URI) { }
}

export class TextMergeTabInput {
    constructor(readonly base: URI, readonly input1: URI, readonly input2: URI, readonly result: URI) { }
}

export class CustomEditorTabInput {
    constructor(readonly uri: URI, readonly viewType: string) { }
}

export class WebviewEditorTabInput {
    constructor(readonly viewType: string) { }
}

export class TelemetryTrustedValue<T> {
    readonly value: T;

    constructor(value: T) {
        this.value = value;
    }
}

export class TelemetryLogger {
    readonly onDidChangeEnableStates: theia.Event<TelemetryLogger>;
    readonly isUsageEnabled: boolean;
    readonly isErrorsEnabled: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logUsage(eventName: string, data?: Record<string, any | TelemetryTrustedValue<any>>): void { }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logError(eventNameOrError: string | Error, data?: Record<string, any | TelemetryTrustedValue<any>>): void { }
    dispose(): void { }
    constructor(readonly sender: TelemetrySender, readonly options?: TelemetryLoggerOptions) { }
}

export interface TelemetrySender {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendEventData(eventName: string, data?: Record<string, any>): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendErrorData(error: Error, data?: Record<string, any>): void;
    flush?(): void | Thenable<void>;
}

export interface TelemetryLoggerOptions {
    /**
     * Whether or not you want to avoid having the built-in common properties such as os, extension name, etc injected into the data object.
     * Defaults to `false` if not defined.
     */
    readonly ignoreBuiltInCommonProperties?: boolean;

    /**
     * Whether or not unhandled errors on the extension host caused by your extension should be logged to your sender.
     * Defaults to `false` if not defined.
     */
    readonly ignoreUnhandledErrors?: boolean;

    /**
     * Any additional common properties which should be injected into the data object.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly additionalCommonProperties?: Record<string, any>;
}

export class NotebookEditorTabInput {
    constructor(readonly uri: URI, readonly notebookType: string) { }
}

export class NotebookDiffEditorTabInput {
    constructor(readonly original: URI, readonly modified: URI, readonly notebookType: string) { }
}

export class TerminalEditorTabInput {
    constructor() { }
}
export class InteractiveWindowInput {
    constructor(readonly uri: URI, readonly inputBoxUri: URI) { }
}

// #endregion

// #region DocumentPaste
@es5ClassCompat
export class DocumentPasteEdit {
    constructor(insertText: string | SnippetString) {
        this.insertText = insertText;
    }
    insertText: string | SnippetString;
    additionalEdit?: WorkspaceEdit;
}
// #endregion

// #region DocumentPaste
export enum EditSessionIdentityMatch {
    Complete = 100,
    Partial = 50,
    None = 0
}
// #endregion
