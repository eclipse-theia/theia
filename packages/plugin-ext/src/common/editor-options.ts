/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// enum copied from monaco.d.ts
/**
 * The style in which the editor's cursor should be rendered.
 */
export enum TextEditorCursorStyle {
    /**
     * As a vertical line
     */
    Line = 1,

    /**
     * As a block
     */
    Block = 2,

    /**
     * As a horizontal line, under character
     */
    Underline = 3,

    /**
     * As a thin vertical line
     */
    LineThin = 4,

    /**
     * As an outlined block, on top of a character
     */
    BlockOutline = 5,

    /**
     * As a thin horizontal line, under a character
     */
    UnderlineThin = 6
}

export function cursorStyleToString(cursorStyle: TextEditorCursorStyle): string {
    switch (cursorStyle) {
        case TextEditorCursorStyle.Line:
            return 'line';
        case TextEditorCursorStyle.Block:
            return 'block';
        case TextEditorCursorStyle.Underline:
            return 'underline';
        case TextEditorCursorStyle.LineThin:
            return 'line-thin';
        case TextEditorCursorStyle.BlockOutline:
            return 'block-outline';
        case TextEditorCursorStyle.UnderlineThin:
            return 'underline-thin';
        default:
            throw new Error('cursorStyleToString: Unknown cursorStyle');
    }
}
