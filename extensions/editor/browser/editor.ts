/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Position, Range, TextDocument } from 'vscode-languageserver-types';
import URI from "../../application/common/uri";
import { Event, Disposable } from '../../application/common';

export {
    Position, Range, TextDocument
}

export const TextEditorProvider = Symbol('TextEditorProvider');
export type TextEditorProvider = (uri: URI) => Promise<TextEditor>;

export interface TextEditor extends Disposable, TextEditorSelection {
    readonly node: HTMLElement;

    readonly uri: URI;
    readonly document: TextDocument;

    cursor: Position;
    readonly onCursorPositionChanged: Event<Position>;

    selection: Range;
    readonly onSelectionChanged: Event<Range>;

    focus(): void;
    blur(): void;
    isFocused(): boolean;
    readonly onFocusChanged: Event<boolean>;

    revealPosition(position: Position): void;
    revealRange(range: Range): void;

    /**
     * Rerender the editor.
     */
    refresh(): void;
    /**
     * Resize the editor to fit its node.
     */
    resizeToFit(): void;
    setSize(size: Dimension): void;
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

export namespace TextEditorSelection {
    export function is(e: any): e is TextEditorSelection {
        return e && e["uri"] instanceof URI
    }
}