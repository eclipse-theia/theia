/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
    if (cursorStyle === TextEditorCursorStyle.Line) {
        return 'line';
    } else if (cursorStyle === TextEditorCursorStyle.Block) {
        return 'block';
    } else if (cursorStyle === TextEditorCursorStyle.Underline) {
        return 'underline';
    } else if (cursorStyle === TextEditorCursorStyle.LineThin) {
        return 'line-thin';
    } else if (cursorStyle === TextEditorCursorStyle.BlockOutline) {
        return 'block-outline';
    } else if (cursorStyle === TextEditorCursorStyle.UnderlineThin) {
        return 'underline-thin';
    } else {
        throw new Error('cursorStyleToString: Unknown cursorStyle');
    }
}
