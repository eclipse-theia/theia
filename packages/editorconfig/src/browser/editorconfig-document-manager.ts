/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc.
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

import { injectable, inject, postConstruct } from 'inversify';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { TextDocumentSaveReason } from '@theia/languages/lib/browser';
import { EditorManager, EditorWidget, TextEditor } from '@theia/editor/lib/browser';
import { EditorconfigService } from '../common/editorconfig-interface';
import { KnownProps } from 'editorconfig';

@injectable()
export class EditorconfigDocumentManager {

    public static readonly LINE_ENDING = {
        LF: '\n',
        CRLF: '\r\n'
    };

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(EditorconfigService)
    protected readonly editorconfigServer: EditorconfigService;

    private properties: { [file: string]: KnownProps } = {};

    @postConstruct()
    protected init(): void {
        // refresh properties when opening an editor
        this.editorManager.onCreated(e => {
            this.addOnSaveHandler(e);
            this.refreshProperties(e.editor);
        });

        // refresh properties when changing current editor
        this.editorManager.onCurrentEditorChanged(e => {
            if (e) {
                this.refreshProperties(e.editor);
            }
        });
    }

    /**
     * Adds handler to update editor properties before saving the document.
     *
     * @param editorWidget editor widget
     */
    protected addOnSaveHandler(editorWidget: EditorWidget): void {
        const monacoEditor = MonacoEditor.get(editorWidget);
        if (monacoEditor) {
            monacoEditor.document.onWillSaveModel(event => {
                event.waitUntil(new Promise<monaco.editor.IIdentifiedSingleEditOperation[]>(resolve => {
                    const uri = monacoEditor.uri.toString();
                    const properties = this.properties[uri];

                    const edits = [];
                    edits.push(...this.getEditsTrimmingTrailingWhitespaces(monacoEditor, properties, event.reason));

                    const edit = this.getEditInsertingFinalNewLine(monacoEditor, properties);
                    if (edit) {
                        edits.push(edit);

                        // get current cursor position
                        const cursor = monacoEditor.cursor;

                        // and then restore it after resolving the promise
                        setTimeout(() => {
                            monacoEditor.cursor = cursor;
                        }, 0);
                    }

                    resolve(edits);
                }));
            });
        }
    }

    /**
     * Refreshes editorconfig properties for the editor.
     *
     * @param editor editor
     */
    protected refreshProperties(editor: TextEditor): void {
        if (editor instanceof MonacoEditor) {
            const uri = editor.uri.toString();
            this.editorconfigServer.getConfig(uri).then(properties => {
                this.properties[uri] = properties;
                this.applyProperties(properties, editor);
            });
        }
    }

    /**
     * Applies editorconfig properties for the editor.
     *
     * @param properties editorcofig properties
     * @param editor Monaco editor
     */
    applyProperties(properties: KnownProps, editor: MonacoEditor): void {
        if (this.isSet(properties.indent_style)) {
            this.ensureIndentStyle(editor, properties);
        }

        if (this.isSet(properties.indent_size)) {
            this.ensureIndentSize(editor, properties);
        }

        if (this.isSet(properties.end_of_line)) {
            this.ensureEndOfLine(editor, properties);
        }
    }

    /**
     * Determines whether property is set.
     */
    // tslint:disable-next-line:no-any
    isSet(property: any): boolean {
        if (!property || 'unset' === property) {
            return false;
        }

        return true;
    }

    /**
     * indent_style: set to tab or space to use hard tabs or soft tabs respectively.
     */
    ensureIndentStyle(editor: MonacoEditor, properties: KnownProps): void {
        if ('space' === properties.indent_style) {
            editor.document.textEditorModel.updateOptions({
                insertSpaces: true
            });
        } else if ('tab' === properties.indent_style) {
            editor.document.textEditorModel.updateOptions({
                insertSpaces: false
            });
        }
    }

    /**
     * indent_size: a whole number defining the number of columns
     * used for each indentation level and the width of soft tabs (when supported).
     * When set to tab, the value of tab_width (if specified) will be used.
     */
    ensureIndentSize(editor: MonacoEditor, properties: KnownProps): void {
        if ('tab' === properties.indent_size) {
            if (this.isSet(properties.tab_width)) {
                this.ensureTabWidth(editor, properties);
            }
        } else if (typeof properties.indent_size === 'number') {
            const indentSize: number = properties.indent_size as number;
            editor.document.textEditorModel.updateOptions({
                tabSize: indentSize
            });
        }
    }

    /**
     * tab_width: a whole number defining the number of columns
     * used to represent a tab character. This defaults to the value of
     * indent_size and doesn't usually need to be specified.
     */
    ensureTabWidth(editor: MonacoEditor, properties: KnownProps): void {
        if (typeof properties.tab_width === 'number') {
            const tabWidth = properties.tab_width as number;
            editor.document.textEditorModel.updateOptions({
                tabSize: tabWidth
            });
        }
    }

    /**
     * end_of_line: set to lf or crlf to control how line breaks are represented.
     */
    ensureEndOfLine(editor: MonacoEditor, properties: KnownProps): void {
        if ('lf' === properties.end_of_line) {
            editor.document.textEditorModel.setEOL(monaco.editor.EndOfLineSequence.LF);
        } else if ('crlf' === properties.end_of_line) {
            editor.document.textEditorModel.setEOL(monaco.editor.EndOfLineSequence.CRLF);
        }
    }

    /**
     * Returns array of edits trimming trailing whitespaces for the whole document.
     *
     * @param editor editor
     * @param properties editorconfig properties
     */
    private getEditsTrimmingTrailingWhitespaces(editor: MonacoEditor, properties: KnownProps, saveReason?: TextDocumentSaveReason): monaco.editor.IIdentifiedSingleEditOperation[] {
        const edits = [];

        if (MonacoEditor.get(this.editorManager.activeEditor) === editor) {
            const trimReason = (saveReason !== TextDocumentSaveReason.Manual) ? 'auto-save' : undefined;
            editor.commandService.executeCommand('editor.action.trimTrailingWhitespace', {
                reason: trimReason
            });
            return [];
        }

        if (this.isSet(properties.trim_trailing_whitespace)) {
            const lines = editor.document.lineCount;
            for (let i = 1; i <= lines; i++) {
                const line = editor.document.textEditorModel.getLineContent(i);
                const trimmedLine = line.trimRight();

                if (line.length !== trimmedLine.length) {
                    edits.push({
                        forceMoveMarkers: false,
                        range: new monaco.Range(i, trimmedLine.length + 1, i, line.length + 1),
                        text: ''
                    });
                }
            }
        }

        return edits;
    }

    /**
     * Returns edit inserting final new line at the end of the document.
     *
     * @param editor editor
     * @param properties editorconfig properties
     */
    private getEditInsertingFinalNewLine(editor: MonacoEditor, properties: KnownProps): monaco.editor.IIdentifiedSingleEditOperation | undefined {
        if (this.isSet(properties.insert_final_newline)) {
            const lines = editor.document.lineCount;
            let lineContent = editor.document.textEditorModel.getLineContent(lines);

            if (this.isSet(properties.trim_trailing_whitespace)) {
                lineContent = lineContent.trimRight();
            }

            const lineEnding = 'crlf' === properties.end_of_line ?
                EditorconfigDocumentManager.LINE_ENDING.CRLF : EditorconfigDocumentManager.LINE_ENDING.LF;

            if ('' !== lineContent) {
                return {
                    forceMoveMarkers: false,
                    range: new monaco.Range(lines, lineContent.length + 1, lines, lineContent.length + 1),
                    text: lineEnding
                };
            }
        }

        return undefined;
    }

}
