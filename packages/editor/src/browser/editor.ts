/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Position, Range } from 'vscode-languageserver-types';
import * as lsp from 'vscode-languageserver-types';
import URI from "@theia/core/lib/common/uri";
import { Event, Disposable } from '@theia/core/lib/common';
import { Saveable, Navigatable } from '@theia/core/lib/browser';
import { EditorDecoration } from './editor-decorations-service';

export {
    Position, Range
};

export const TextEditorProvider = Symbol('TextEditorProvider');
export type TextEditorProvider = (uri: URI) => Promise<TextEditor>;

export interface TextEditorDocument extends lsp.TextDocument, Saveable, Disposable {
    getLineContent(lineNumber: number): string;
}

export interface TextDocumentContentChangeDelta extends lsp.TextDocumentContentChangeEvent {
    readonly range: Range;
    readonly rangeLength: number;
}

export namespace TextDocumentContentChangeDelta {

    // tslint:disable-next-line:no-any
    export function is(arg: any): arg is TextDocumentContentChangeDelta {
        return !!arg && typeof arg['text'] === 'string' && typeof arg['rangeLength'] === 'number' && Range.is(arg['range']);
    }

}

export interface TextDocumentChangeEvent {
    readonly document: TextEditorDocument;
    readonly contentChanges: TextDocumentContentChangeDelta[];
}

export interface TextEditor extends Disposable, TextEditorSelection, Navigatable {
    readonly node: HTMLElement;

    readonly uri: URI;
    readonly document: TextEditorDocument;
    readonly onDocumentContentChanged: Event<TextDocumentChangeEvent>;

    cursor: Position;
    readonly onCursorPositionChanged: Event<Position>;

    selection: Range;
    readonly onSelectionChanged: Event<Range>;

    focus(): void;
    blur(): void;
    isFocused(): boolean;
    readonly onFocusChanged: Event<boolean>;

    revealPosition(position: Position, options?: RevealPositionOptions): void;
    revealRange(range: Range, options?: RevealRangeOptions): void;

    /**
     * Rerender the editor.
     */
    refresh(): void;
    /**
     * Resize the editor to fit its node.
     */
    resizeToFit(): void;
    setSize(size: Dimension): void;

    /**
     * Applies given new decorations and removes old decorations identified by ids.
     *
     * @returns identifiers of applied decorations, which can be removed in next call.
     */
    deltaDecorations(params: DeltaDecorationParams): string[];

    getVisibleColumn(position: Position): number;

    /**
     * Replaces the text of source given in ReplacetextParams.
     * @param params: ReplaceTextParams
     */
    replaceText(params: ReplaceTextParams): Promise<boolean>;
}

export interface Dimension {
    width: number;
    height: number;
}

export interface TextEditorSelection {
    uri: URI
    cursor?: Position
    selection?: Range
}

export interface RevealPositionOptions {
    vertical: 'auto' | 'center' | 'centerIfOutsideViewport';
    horizontal?: boolean;
}

export interface RevealRangeOptions {
    at: 'auto' | 'center' | 'top' | 'centerIfOutsideViewport';
}

export interface SetDecorationParams {
    uri: string;
    kind: string;
    newDecorations: EditorDecoration[];
}

export interface DeltaDecorationParams {
    uri: string;
    oldDecorations: string[];
    newDecorations: EditorDecoration[];
}

export interface ReplaceTextParams {
    /**
     * the source to edit
     */
    source: string;
    /**
     * the replace operations
     */
    replaceOperations: ReplaceOperation[];
}

export interface ReplaceOperation {
    /**
     * the position that shall be replaced
     */
    range: Range;
    /**
     * the text to replace with
     */
    text: string;
}

export namespace TextEditorSelection {
    // tslint:disable-next-line:no-any
    export function is(e: any): e is TextEditorSelection {
        return e && e["uri"] instanceof URI;
    }
}
