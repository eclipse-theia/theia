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

export function cursorStyleToString(cursorStyle: TextEditorCursorStyle): 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin' {
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
