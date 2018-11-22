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
import { EditorManager, EditorWidget, TextEditor, EditorPreferences } from '@theia/editor/lib/browser';
import { EditorconfigService } from '../common/editorconfig-interface';
import { KnownProps } from 'editorconfig';
import { CommandService } from '@theia/core';
@injectable()
export class EditorconfigDocumentManager {

    public static readonly LINE_ENDING = {
        LF: '\n',
        CRLF: '\r\n'
    };

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(EditorconfigService)
    protected readonly editorconfigServer: EditorconfigService;

    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

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
    protected addOnSaveHandler(editorWidget: EditorWidget) {
        const monacoEditor = MonacoEditor.get(editorWidget);
        if (monacoEditor) {
            monacoEditor.document.onDidSaveModel(event => {
                // monacoEditor.document.save();
                console.log(`onDidSaveModel   dirty: ${monacoEditor.document.dirty}`);
            });
            monacoEditor.document.onWillSaveModel(event => {
                console.log('onWillSaveModel should be first');
                // this.formatDocument(monacoEditor).then(() => {
                console.log(`------------command should have been done----------------- event: ${event}`);
                event.waitUntil(new Promise<monaco.editor.IIdentifiedSingleEditOperation[]>(resolve => {
                    const uri = monacoEditor.uri.toString();
                    const properties = this.properties[uri];

                    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
                    // edits.push(...this.getEditsTrimmingTrailingWhitespaces(monacoEditor, properties, event.reason));
                    const edit = this.getEditInsertingFinalNewLine(monacoEditor, properties);
                    return Promise.all([
                        this.getEditsTrimmingTrailingWhitespaces(monacoEditor, properties, event.reason),
                        this.formatDocument(monacoEditor)
                    ]).then(() => {
                        if (edit) {
                            edits.push(edit);

                            // get current cursor position
                            const cursor = monacoEditor.cursor;

                            // and then restore it after resolving the promise
                            setTimeout(() => {
                                monacoEditor.cursor = cursor;
                            }, 0);
                        }
                        console.log('JB --- reformat should have been done');
                        return resolve(edits);
                    });
                    // return this.formatDocument(monacoEditor).then(() => {
                    //     // if (this.editorPreferences['editor.formatOnSave']) {
                    //     //    monacoEditor.commandService.executeCommand('editor.action.formatDocument').then(() => {

                    //     if (edit) {
                    //         edits.push(edit);

                    //         // get current cursor position
                    //         const cursor = monacoEditor.cursor;

                    //         // and then restore it after resolving the promise
                    //         setTimeout(() => {
                    //             monacoEditor.cursor = cursor;
                    //         }, 0);
                    //     }
                    //     console.log('JB --- reformat should have been done');
                    //     return resolve(edits);
                    // });

                    // }

                    // resolve(edits);
                }));
                // });
            });
        }
    }

    /**
     * Refreshes editorconfig properties for the editor.
     *
     * @param editor editor
     */
    protected refreshProperties(editor: TextEditor) {
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

        if (this.isSet(properties.trim_trailing_whitespace)) {
            this.ensureTrimTrailingWhitespace(editor, properties);
        }

        if (this.isSet(properties.insert_final_newline)) {
            this.ensureEndsWithNewLine(editor, properties);
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
     * trim_trailing_whitespace: set to true to remove any whitespace characters
     * preceding newline characters and false to ensure it doesn't.
     */
    ensureTrimTrailingWhitespace(editor: MonacoEditor, properties: KnownProps): void {
        // const edits = this.getEditsTrimmingTrailingWhitespaces(editor, properties);
        // if (edits.length > 0) {
        //     editor.document.textEditorModel.applyEdits(edits);
        // }

        this.getEditsTrimmingTrailingWhitespaces(editor, properties).then(edits => {
            if (edits.length > 0) {
                editor.document.textEditorModel.applyEdits(edits);
            }
        });
    }

    /**
     * Returns array of edits trimming trailing whitespaces for the whole document.
     *
     * @param editor editor
     * @param properties editorconfig properties
     */
    private async getEditsTrimmingTrailingWhitespaces(
        editor: MonacoEditor, properties: KnownProps, saveReason?: TextDocumentSaveReason
    ): Promise<monaco.editor.IIdentifiedSingleEditOperation[]> {
        const edits = [];

        if (MonacoEditor.get(this.editorManager.activeEditor) === editor) {
            const trimReason = (saveReason !== TextDocumentSaveReason.Manual) ? 'auto-save' : undefined;
            await new Promise((resolve, reject) => editor.commandService.executeCommand('editor.action.trimTrailingWhitespace', {
                reason: trimReason
            }).then(resolve, reject));
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
     * insert_final_newline: set to true to ensure file ends with a newline
     * when saving and false to ensure it doesn't.
     */
    ensureEndsWithNewLine(editor: MonacoEditor, properties: KnownProps): void {
        const edit = this.getEditInsertingFinalNewLine(editor, properties);
        if (edit) {
            // remember cursor position
            const cursor = editor.cursor;

            // apply edit
            editor.document.textEditorModel.applyEdits([edit]);

            // restore cursor position
            editor.cursor = cursor;
        }
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

    /**
     * Format the document when the preference "editor.formatOnSave" is set and the
     * "editor.autoSave" is set to "OFF". Only re-format when saving is done manually.
     *
     * @param editor editor
     */
    private async formatDocument(editor: MonacoEditor): Promise<void> {
        if (MonacoEditor.get(this.editorManager.activeEditor) === editor) {
            // console.log(`--JB formatOnSave: ${this.editorPreferences['editor.formatOnSave']}  editor.autoSave: ${this.editorPreferences['editor.autoSave']} `);
            // if (this.editorPreferences['editor.formatOnSave'] && (this.editorPreferences['editor.autoSave']) === 'off') {
            //     await editor.commandService.executeCommand('editor.action.formatDocument', {
            //         aa: console.log('-----JBJB format document -------JBJB'),
            //     });
            // } else {
            //     console.log('-----===== JB **NO** FORMAT on save');
            // }
            if (this.editorPreferences['editor.formatOnSave'] && (this.editorPreferences['editor.autoSave']) === 'off') {
                await new Promise((resolve, reject) => {
                    editor.commandService.executeCommand('editor.action.formatDocument').then(() => {
                        console.log('----------------formatDocument JB----------------');
                        resolve();
                    }, () => {
                        console.log('command rejected');
                        reject();
                    });
                });

            }
        }
    }

}
