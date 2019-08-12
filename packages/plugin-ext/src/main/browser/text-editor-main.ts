/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import {
    TextEditorConfiguration,
    EditorChangedPropertiesData,
    Selection,
    TextEditorConfigurationUpdate,
    TextEditorRevealType,
    SingleEditOperation,
    ApplyEditsOptions,
    UndoStopOptions,
    DecorationOptions
} from '../../common/plugin-api-rpc';
import { Range } from '../../common/plugin-api-rpc-model';
import { DisposableCollection, Emitter, Event } from '@theia/core';
import { TextEditorCursorStyle, cursorStyleToString } from '../../common/editor-options';
import { TextEditorLineNumbersStyle, EndOfLine } from '../../plugin/types-impl';

export class TextEditorMain {

    private properties: TextEditorPropertiesMain | undefined;
    private modelListeners: DisposableCollection = new DisposableCollection();
    private editor: MonacoEditor | undefined;
    private editorListeners = new DisposableCollection();

    private readonly onPropertiesChangedEmitter = new Emitter<EditorChangedPropertiesData>();

    constructor(
        private id: string,
        private model: monaco.editor.IModel,
        editor: MonacoEditor
    ) {
        this.properties = undefined;
        this.modelListeners.push(this.model.onDidChangeOptions(e => {
            this.updateProperties(undefined);
        }));
        this.setEditor(editor);
        this.updateProperties(undefined);
    }

    private updateProperties(source?: string): void {
        this.setProperties(TextEditorPropertiesMain.readFromEditor(this.properties, this.model, this.editor!), source);
    }

    private setProperties(newProperties: TextEditorPropertiesMain, source: string | undefined): void {
        const result = newProperties.generateDelta(this.properties, source);
        this.properties = newProperties;
        if (result) {
            this.onPropertiesChangedEmitter.fire(result);
        }
    }

    private setEditor(editor?: MonacoEditor): void {
        if (this.editor === editor) {
            return;
        }

        this.editorListeners.dispose();
        this.editorListeners = new DisposableCollection();
        this.editor = editor;

        if (this.editor) {
            const monaco = this.editor.getControl();
            this.editorListeners.push(this.editor.onSelectionChanged(_ => {
                this.updateProperties();
            }));
            this.editorListeners.push(monaco.onDidChangeModel(() => {
                this.setEditor(undefined);
            }));
            this.editorListeners.push(monaco.onDidChangeCursorSelection(e => {
                this.updateProperties(e.source);
            }));
            this.editorListeners.push(monaco.onDidChangeConfiguration(() => {
                this.updateProperties();
            }));
            this.editorListeners.push(monaco.onDidLayoutChange(() => {
                this.updateProperties();
            }));
            this.editorListeners.push(monaco.onDidScrollChange(() => {
                this.updateProperties();
            }));

            this.updateProperties();

        }
    }

    dispose(): void {
        this.modelListeners.dispose();
        delete this.model;

        this.editorListeners.dispose();
        delete this.editor;
    }

    getId(): string {
        return this.id;
    }

    getModel(): monaco.editor.IModel {
        return this.model;
    }

    getProperties(): TextEditorPropertiesMain | undefined {
        return this.properties;
    }

    get onPropertiesChangedEvent(): Event<EditorChangedPropertiesData> {
        return this.onPropertiesChangedEmitter.event;
    }

    setSelections(selections: Selection[]): void {
        if (this.editor) {
            this.editor.getControl().setSelections(selections);
            return;
        }
        const monacoSelections = selections.map(TextEditorMain.toMonacoSelections);
        this.setProperties(new TextEditorPropertiesMain(monacoSelections, this.properties!.options, this.properties!.visibleRanges), undefined);
    }

    setConfiguration(newConfiguration: TextEditorConfigurationUpdate): void {
        this.setIndentConfiguration(newConfiguration);

        if (!this.editor) {
            return;
        }

        if (newConfiguration.cursorStyle) {
            const newCursorStyle = cursorStyleToString(newConfiguration.cursorStyle);
            this.editor.getControl().updateOptions({
                cursorStyle: newCursorStyle
            });
        }

        if (typeof newConfiguration.lineNumbers !== 'undefined') {
            let lineNumbers: 'on' | 'off' | 'relative';
            switch (newConfiguration.lineNumbers) {
                case TextEditorLineNumbersStyle.On:
                    lineNumbers = 'on';
                    break;
                case TextEditorLineNumbersStyle.Relative:
                    lineNumbers = 'relative';
                    break;
                default:
                    lineNumbers = 'off';
            }
            this.editor.getControl().updateOptions({
                lineNumbers: lineNumbers
            });
        }
    }

    private setIndentConfiguration(newConfiguration: TextEditorConfigurationUpdate): void {
        if (newConfiguration.tabSize === 'auto' || newConfiguration.insertSpaces === 'auto') {

            const creationOpts = this.model.getOptions();
            let insertSpaces = creationOpts.insertSpaces;
            let tabSize = creationOpts.tabSize;

            if (newConfiguration.insertSpaces !== 'auto' && typeof newConfiguration.insertSpaces !== 'undefined') {
                insertSpaces = newConfiguration.insertSpaces;
            }

            if (newConfiguration.tabSize !== 'auto' && typeof newConfiguration.tabSize !== 'undefined') {
                tabSize = newConfiguration.tabSize;
            }

            this.model.detectIndentation(insertSpaces, tabSize);
            return;
        }

        const newOpts: monaco.editor.ITextModelUpdateOptions = {};
        if (typeof newConfiguration.insertSpaces !== 'undefined') {
            newOpts.insertSpaces = newConfiguration.insertSpaces;
        }
        if (typeof newConfiguration.tabSize !== 'undefined') {
            newOpts.tabSize = newConfiguration.tabSize;
        }
        this.model.updateOptions(newOpts);
    }

    revealRange(range: monaco.Range, revealType: TextEditorRevealType): void {
        if (!this.editor) {
            return;
        }
        switch (revealType) {
            case TextEditorRevealType.Default:
                this.editor.getControl().revealRange(range, monaco.editor.ScrollType.Smooth);
                break;
            case TextEditorRevealType.InCenter:
                this.editor.getControl().revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
                break;
            case TextEditorRevealType.InCenterIfOutsideViewport:
                this.editor.getControl().revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth);
                break;
            case TextEditorRevealType.AtTop:
                this.editor.getControl().revealRangeAtTop(range, monaco.editor.ScrollType.Smooth);
                break;
            default:
                console.warn(`Unknown revealType: ${revealType}`);
                break;
        }
    }

    applyEdits(versionId: number, edits: SingleEditOperation[], opts: ApplyEditsOptions): boolean {
        if (this.model.getVersionId() !== versionId) {
            // model changed in the meantime
            return false;
        }

        if (!this.editor) {
            return false;
        }

        if (opts.setEndOfLine === EndOfLine.CRLF) {
            this.model.setEOL(monaco.editor.EndOfLineSequence.CRLF);
        } else if (opts.setEndOfLine === EndOfLine.LF) {
            this.model.setEOL(monaco.editor.EndOfLineSequence.LF);
        }

        const transformedEdits = edits.map((edit): monaco.editor.IIdentifiedSingleEditOperation =>
            ({
                range: monaco.Range.lift(edit.range),
                text: edit.text!,
                forceMoveMarkers: edit.forceMoveMarkers
            }));

        if (opts.undoStopBefore) {
            this.editor.getControl().pushUndoStop();
        }
        this.editor.getControl().executeEdits('MainThreadTextEditor', transformedEdits);
        if (opts.undoStopAfter) {
            this.editor.getControl().pushUndoStop();
        }
        return true;
    }

    insertSnippet(template: string, ranges: Range[], opts: UndoStopOptions): boolean {

        if (!this.editor) {
            return false;
        }

        const snippetController: SnippetController2 = this.editor!.getControl().getContribution('snippetController2');

        const selections = ranges.map(r => new monaco.Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn));
        this.editor.getControl().setSelections(selections);
        this.editor.focus();

        snippetController.insert(template, 0, 0, opts.undoStopBefore, opts.undoStopAfter);

        return true;
    }

    setDecorations(key: string, ranges: DecorationOptions[]): void {
        if (!this.editor) {
            return;
        }
        this.editor.getControl().setDecorations(key, ranges.map(option => Object.assign(option, { color: undefined })));
    }

    setDecorationsFast(key: string, _ranges: number[]): void {
        if (!this.editor) {
            return;
        }
        const ranges: Range[] = [];
        const len = Math.floor(_ranges.length / 4);
        for (let i = 0; i < len; i++) {
            ranges[i] = new monaco.Range(_ranges[4 * i], _ranges[4 * i + 1], _ranges[4 * i + 2], _ranges[4 * i + 3]);
        }

        this.editor.getControl().setDecorationsFast(key, ranges);
    }

    private static toMonacoSelections(selection: Selection): monaco.Selection {
        return new monaco.Selection(selection.selectionStartLineNumber, selection.selectionStartColumn, selection.positionLineNumber, selection.positionColumn);
    }
}

interface SnippetController2 extends monaco.editor.IEditorContribution {
    insert(template: string,
        overwriteBefore: number, overwriteAfter: number,
        undoStopBefore: boolean, undoStopAfter: boolean): void;
    finish(): void;
    cancel(): void;
    dispose(): void;
    prev(): void;
    next(): void;
}

export class TextEditorPropertiesMain {
    constructor(
        readonly selections: monaco.Selection[],
        readonly options: TextEditorConfiguration,
        readonly visibleRanges: monaco.Range[]
    ) {
    }

    generateDelta(old: TextEditorPropertiesMain | undefined, source: string | undefined): EditorChangedPropertiesData | undefined {
        const result: EditorChangedPropertiesData = {
            options: undefined,
            selections: undefined,
            visibleRanges: undefined
        };

        if (!old || !TextEditorPropertiesMain.selectionsEqual(old.selections, this.selections)) {
            result.selections = {
                selections: this.selections,
                source: source
            };
        }

        if (!old || !TextEditorPropertiesMain.optionsEqual(old.options, this.options)) {
            result.options = this.options;
        }

        if (!old || !TextEditorPropertiesMain.rangesEqual(old.visibleRanges, this.visibleRanges)) {
            result.visibleRanges = this.visibleRanges;
        }

        if (result.selections || result.visibleRanges || result.options) {
            return result;
        }

        return undefined;
    }

    static readFromEditor(prevProperties: TextEditorPropertiesMain | undefined, model: monaco.editor.IModel, editor: MonacoEditor): TextEditorPropertiesMain {
        const selections = TextEditorPropertiesMain.getSelectionsFromEditor(prevProperties, editor);
        const options = TextEditorPropertiesMain.getOptionsFromEditor(prevProperties, model, editor);
        const visibleRanges = TextEditorPropertiesMain.getVisibleRangesFromEditor(prevProperties, editor);
        return new TextEditorPropertiesMain(selections, options, visibleRanges);
    }

    private static getSelectionsFromEditor(prevProperties: TextEditorPropertiesMain | undefined, editor: MonacoEditor): monaco.Selection[] {
        let result: monaco.Selection[] | undefined = undefined;
        if (editor) {
            result = editor.getControl().getSelections() || undefined;
        }

        if (!result && prevProperties) {
            result = prevProperties.selections;
        }

        if (!result) {
            result = [new monaco.Selection(1, 1, 1, 1)];
        }
        return result;
    }

    private static getOptionsFromEditor(prevProperties: TextEditorPropertiesMain | undefined, model: monaco.editor.IModel, editor: MonacoEditor): TextEditorConfiguration {
        if (model.isDisposed()) {
            return prevProperties!.options;
        }

        let cursorStyle: TextEditorCursorStyle;
        let lineNumbers: TextEditorLineNumbersStyle;
        if (editor) {
            const editorOptions = editor.getControl().getConfiguration();
            cursorStyle = editorOptions.viewInfo.cursorStyle;
            switch (editorOptions.viewInfo.renderLineNumbers) {
                case monaco.editor.RenderLineNumbersType.Off:
                    lineNumbers = TextEditorLineNumbersStyle.Off;
                    break;
                case monaco.editor.RenderLineNumbersType.Relative:
                    lineNumbers = TextEditorLineNumbersStyle.Relative;
                    break;
                default:
                    lineNumbers = TextEditorLineNumbersStyle.On;
                    break;
            }
        } else if (prevProperties) {
            cursorStyle = prevProperties.options.cursorStyle;
            lineNumbers = prevProperties.options.lineNumbers;
        } else {
            cursorStyle = TextEditorCursorStyle.Line;
            lineNumbers = TextEditorLineNumbersStyle.On;
        }

        const modelOptions = model.getOptions();
        return {
            insertSpaces: modelOptions.insertSpaces,
            tabSize: modelOptions.tabSize,
            cursorStyle,
            lineNumbers,
        };
    }

    private static getVisibleRangesFromEditor(prevProperties: TextEditorPropertiesMain | undefined, editor: MonacoEditor): monaco.Range[] {
        if (editor) {
            return editor.getControl().getVisibleRanges();
        }
        return [];
    }

    private static selectionsEqual(a: monaco.Selection[], b: monaco.Selection[]): boolean {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!a[i].equalsSelection(b[i])) {
                return false;
            }
        }
        return true;
    }

    private static optionsEqual(a: TextEditorConfiguration, b: TextEditorConfiguration): boolean {
        if (a && !b || !a && b) {
            return false;
        }
        if (!a && !b) {
            return true;
        }
        return (
            a.tabSize === b.tabSize
            && a.insertSpaces === b.insertSpaces
            && a.cursorStyle === b.cursorStyle
            && a.lineNumbers === b.lineNumbers
        );
    }

    private static rangesEqual(a: monaco.Range[], b: monaco.Range[]): boolean {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!a[i].equalsRange(b[i])) {
                return false;
            }
        }
        return true;
    }

}
