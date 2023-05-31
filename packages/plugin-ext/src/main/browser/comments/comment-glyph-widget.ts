// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
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
import { Disposable } from '@theia/core/lib/common';
import * as monaco from '@theia/monaco-editor-core';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.3/src/vs/workbench/contrib/comments/browser/commentGlyphWidget.ts

export class CommentGlyphWidget implements Disposable {

    private lineNumber!: number;
    private editor: monaco.editor.ICodeEditor;
    private commentsDecorations: string[] = [];
    readonly commentsOptions: monaco.editor.IModelDecorationOptions;
    constructor(editor: monaco.editor.ICodeEditor) {
        this.commentsOptions = {
            isWholeLine: true,
            linesDecorationsClassName: 'comment-range-glyph comment-thread'
        };
        this.editor = editor;
    }

    getPosition(): number {
        const model = this.editor.getModel();
        const range = model && this.commentsDecorations && this.commentsDecorations.length
            ? model.getDecorationRange(this.commentsDecorations[0])
            : null;

        return range ? range.startLineNumber : this.lineNumber;
    }

    setLineNumber(lineNumber: number): void {
        this.lineNumber = lineNumber;
        const commentsDecorations = [{
            range: {
                startLineNumber: lineNumber, startColumn: 1,
                endLineNumber: lineNumber, endColumn: 1
            },
            options: this.commentsOptions
        }];

        this.commentsDecorations = this.editor.deltaDecorations(this.commentsDecorations, commentsDecorations);
    }

    dispose(): void {
        if (this.commentsDecorations) {
            this.editor.deltaDecorations(this.commentsDecorations, []);
        }
    }
}
