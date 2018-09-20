/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { MonacoToProtocolConverter, ProtocolToMonacoConverter, TextEdit } from 'monaco-languageclient';
import { ElementExt } from '@phosphor/domutils';
import URI from '@theia/core/lib/common/uri';
import { DisposableCollection, Disposable, Emitter, Event } from '@theia/core/lib/common';
import {
    Dimension,
    EditorManager,
    EditorWidget,
    Position,
    Range,
    TextDocumentContentChangeDelta,
    TextDocumentChangeEvent,
    TextEditor,
    RevealRangeOptions,
    RevealPositionOptions,
    DeltaDecorationParams,
    ReplaceTextParams,
    EditorDecoration,
    EditorMouseEvent
} from '@theia/editor/lib/browser';
import { MonacoEditorModel } from './monaco-editor-model';

import IEditorConstructionOptions = monaco.editor.IEditorConstructionOptions;
import IModelDeltaDecoration = monaco.editor.IModelDeltaDecoration;
import IEditorOverrideServices = monaco.editor.IEditorOverrideServices;
import IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;
import IIdentifiedSingleEditOperation = monaco.editor.IIdentifiedSingleEditOperation;
import IBoxSizing = ElementExt.IBoxSizing;
import SuggestController = monaco.suggestController.SuggestController;
import CommonFindController = monaco.findController.CommonFindController;
import RenameController = monaco.rename.RenameController;

export class MonacoEditor implements TextEditor {

    protected readonly toDispose = new DisposableCollection();

    protected readonly autoSizing: boolean;
    protected readonly minHeight: number;
    protected readonly maxHeight: number;
    protected editor: IStandaloneCodeEditor;

    protected readonly onCursorPositionChangedEmitter = new Emitter<Position>();
    protected readonly onSelectionChangedEmitter = new Emitter<Range>();
    protected readonly onFocusChangedEmitter = new Emitter<boolean>();
    protected readonly onDocumentContentChangedEmitter = new Emitter<TextDocumentChangeEvent>();
    protected readonly onMouseDownEmitter = new Emitter<EditorMouseEvent>();
    protected readonly onLanguageChangedEmitter = new Emitter<string>();
    readonly onLanguageChanged = this.onLanguageChangedEmitter.event;

    readonly documents = new Set<MonacoEditorModel>();

    constructor(
        readonly uri: URI,
        readonly document: MonacoEditorModel,
        readonly node: HTMLElement,
        protected readonly m2p: MonacoToProtocolConverter,
        protected readonly p2m: ProtocolToMonacoConverter,
        options?: MonacoEditor.IOptions,
        override?: IEditorOverrideServices,
    ) {
        this.toDispose.pushAll([
            this.onCursorPositionChangedEmitter,
            this.onSelectionChangedEmitter,
            this.onFocusChangedEmitter,
            this.onDocumentContentChangedEmitter,
            this.onMouseDownEmitter,
            this.onLanguageChangedEmitter
        ]);
        this.documents.add(document);
        this.autoSizing = options && options.autoSizing !== undefined ? options.autoSizing : false;
        this.minHeight = options && options.minHeight !== undefined ? options.minHeight : -1;
        this.maxHeight = options && options.maxHeight !== undefined ? options.maxHeight : -1;
        this.toDispose.push(this.create(options, override));
        this.addHandlers(this.editor);
    }

    protected create(options?: IEditorConstructionOptions, override?: monaco.editor.IEditorOverrideServices): Disposable {
        return this.editor = monaco.editor.create(this.node, {
            ...options,
            lightbulb: { enabled: true },
            fixedOverflowWidgets: true,
            scrollbar: {
                useShadows: false,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
            }
        }, override);
    }

    protected addHandlers(codeEditor: IStandaloneCodeEditor): void {
        this.toDispose.push(codeEditor.onDidChangeModelLanguage(e =>
            this.onLanguageChangedEmitter.fire(e.newLanguage)
        ));
        this.toDispose.push(codeEditor.onDidChangeConfiguration(() => this.refresh()));
        this.toDispose.push(codeEditor.onDidChangeModel(() => this.refresh()));
        this.toDispose.push(codeEditor.onDidChangeModelContent(e => {
            this.refresh();
            this.onDocumentContentChangedEmitter.fire({ document: this.document, contentChanges: e.changes.map(this.mapModelContentChange.bind(this)) });
        }));
        this.toDispose.push(codeEditor.onDidChangeCursorPosition(() =>
            this.onCursorPositionChangedEmitter.fire(this.cursor)
        ));
        this.toDispose.push(codeEditor.onDidChangeCursorSelection(() =>
            this.onSelectionChangedEmitter.fire(this.selection)
        ));
        this.toDispose.push(codeEditor.onDidFocusEditorText(() =>
            this.onFocusChangedEmitter.fire(this.isFocused())
        ));
        this.toDispose.push(codeEditor.onDidBlurEditorText(() =>
            this.onFocusChangedEmitter.fire(this.isFocused())
        ));
        this.toDispose.push(codeEditor.onMouseDown(e => {
            const { position, range } = e.target;
            this.onMouseDownEmitter.fire({
                target: {
                    ...e.target,
                    mouseColumn: this.m2p.asPosition(undefined, e.target.mouseColumn).character,
                    range: range && this.m2p.asRange(range),
                    position: position && this.m2p.asPosition(position.lineNumber, position.column)
                },
                event: e.event.browserEvent
            });
        }));
    }

    protected mapModelContentChange(change: monaco.editor.IModelContentChange): TextDocumentContentChangeDelta {
        return {
            range: this.m2p.asRange(change.range),
            rangeLength: change.rangeLength,
            text: change.text
        };
    }

    get onDispose() {
        return this.toDispose.onDispose;
    }

    get onDocumentContentChanged(): Event<TextDocumentChangeEvent> {
        return this.onDocumentContentChangedEmitter.event;
    }

    get cursor(): Position {
        const { lineNumber, column } = this.editor.getPosition();
        return this.m2p.asPosition(lineNumber, column);
    }

    set cursor(cursor: Position) {
        const position = this.p2m.asPosition(cursor);
        this.editor.setPosition(position);
    }

    get onCursorPositionChanged(): Event<Position> {
        return this.onCursorPositionChangedEmitter.event;
    }

    get selection(): Range {
        return this.m2p.asRange(this.editor.getSelection());
    }

    set selection(selection: Range) {
        const range = this.p2m.asRange(selection);
        this.editor.setSelection(range);
    }

    get onSelectionChanged(): Event<Range> {
        return this.onSelectionChangedEmitter.event;
    }

    revealPosition(raw: Position, options: RevealPositionOptions = { vertical: 'center' }): void {
        const position = this.p2m.asPosition(raw);
        switch (options.vertical) {
            case 'auto':
                this.editor.revealPosition(position);
                break;
            case 'center':
                this.editor.revealPositionInCenter(position);
                break;
            case 'centerIfOutsideViewport':
                this.editor.revealPositionInCenterIfOutsideViewport(position);
                break;
        }
    }

    revealRange(raw: Range, options: RevealRangeOptions = { at: 'center' }): void {
        const range = this.p2m.asRange(raw);
        switch (options.at) {
            case 'top':
                this.editor.revealRangeAtTop(range!);
                break;
            case 'center':
                this.editor.revealRangeInCenter(range!);
                break;
            case 'centerIfOutsideViewport':
                this.editor.revealRangeInCenterIfOutsideViewport(range!);
                break;
            case 'auto':
                this.editor.revealRange(range!);
                break;
        }
    }

    focus() {
        this.editor.focus();
    }

    blur(): void {
        const node = this.editor.getDomNode();
        const textarea = node.querySelector('textarea') as HTMLElement;
        textarea.blur();
    }

    isFocused({ strict }: { strict: boolean } = { strict: false }): boolean {
        if (!this.editor.hasTextFocus()) {
            return false;
        }
        if (strict) {
            return !this.isSuggestWidgetVisible() && !this.isFindWidgetVisible() && !this.isRenameInputVisible();
        }
        return true;
    }

    get onFocusChanged(): Event<boolean> {
        return this.onFocusChangedEmitter.event;
    }

    get onMouseDown(): Event<EditorMouseEvent> {
        return this.onMouseDownEmitter.event;
    }

    /**
     * `true` if the suggest widget is visible in the editor. Otherwise, `false`.
     */
    isSuggestWidgetVisible(): boolean {
        const widget = this.editor.getContribution<SuggestController>('editor.contrib.suggestController')._widget;
        return widget ? widget.suggestWidgetVisible.get() : false;
    }

    /**
     * `true` if the find (and replace) widget is visible in the editor. Otherwise, `false`.
     */
    isFindWidgetVisible(): boolean {
        return this.editor.getContribution<CommonFindController>('editor.contrib.findController')._findWidgetVisible.get();
    }

    /**
     * `true` if the name rename refactoring input HTML element is visible. Otherwise, `false`.
     */
    isRenameInputVisible(): boolean {
        return this.editor.getContribution<RenameController>('editor.contrib.renameController')._renameInputVisible.get();
    }

    dispose() {
        this.toDispose.dispose();
    }

    getControl() {
        return this.editor;
    }

    refresh(): void {
        this.autoresize();
    }

    resizeToFit(): void {
        this.autoresize();
    }

    setSize(dimension: Dimension): void {
        this.resize(dimension);
    }

    protected autoresize() {
        if (this.autoSizing) {
            // tslint:disable-next-line:no-null-keyword
            this.resize(null);
        }
    }

    protected resize(dimension: Dimension | null): void {
        if (this.node) {
            const layoutSize = this.computeLayoutSize(this.node, dimension);
            this.editor.layout(layoutSize);
        }
    }

    protected computeLayoutSize(hostNode: HTMLElement, dimension: monaco.editor.IDimension | null): monaco.editor.IDimension {
        if (dimension && dimension.width >= 0 && dimension.height >= 0) {
            return dimension;
        }
        const boxSizing = ElementExt.boxSizing(hostNode);

        const width = (!dimension || dimension.width < 0) ?
            this.getWidth(hostNode, boxSizing) :
            dimension.width;

        const height = (!dimension || dimension.height < 0) ?
            this.getHeight(hostNode, boxSizing) :
            dimension.height;

        return { width, height };
    }

    protected getWidth(hostNode: HTMLElement, boxSizing: IBoxSizing): number {
        return hostNode.offsetWidth - boxSizing.horizontalSum;
    }

    protected getHeight(hostNode: HTMLElement, boxSizing: IBoxSizing): number {
        if (!this.autoSizing) {
            return hostNode.offsetHeight - boxSizing.verticalSum;
        }
        const configuration = this.editor.getConfiguration();

        const lineHeight = configuration.lineHeight;
        const lineCount = this.editor.getModel().getLineCount();
        const contentHeight = lineHeight * lineCount;

        const horizontalScrollbarHeight = configuration.layoutInfo.horizontalScrollbarHeight;

        const editorHeight = contentHeight + horizontalScrollbarHeight;
        if (this.minHeight >= 0) {
            const minHeight = lineHeight * this.minHeight + horizontalScrollbarHeight;
            if (editorHeight < minHeight) {
                return minHeight;
            }
        }
        if (this.maxHeight >= 0) {
            const maxHeight = lineHeight * this.maxHeight + horizontalScrollbarHeight;
            return Math.min(maxHeight, editorHeight);
        }
        return editorHeight;
    }

    isActionSupported(id: string): boolean {
        const action = this.editor.getAction(id);
        return !!action && action.isSupported();
    }

    runAction(id: string): monaco.Promise<void> {
        const action = this.editor.getAction(id);
        if (action && action.isSupported()) {
            return action.run();
        }
        return monaco.Promise.as(undefined);
    }

    get commandService(): monaco.commands.ICommandService {
        return this.editor._commandService;
    }

    get instantiationService(): monaco.instantiation.IInstantiationService {
        return this.editor._instantiationService;
    }

    deltaDecorations(params: DeltaDecorationParams): string[] {
        const oldDecorations = params.oldDecorations;
        const newDecorations = this.toDeltaDecorations(params);
        return this.editor.deltaDecorations(oldDecorations, newDecorations);
    }

    protected toDeltaDecorations(params: DeltaDecorationParams): IModelDeltaDecoration[] {
        return params.newDecorations.map(decoration => <IModelDeltaDecoration>{
            ...decoration,
            range: this.p2m.asRange(decoration.range),
        });
    }

    getLinesDecorations(startLineNumber: number, endLineNumber: number): (EditorDecoration & Readonly<{ id: string }>)[] {
        const toPosition = (line: number): monaco.Position => this.p2m.asPosition({ line, character: 0 });
        const start = toPosition(startLineNumber).lineNumber;
        const end = toPosition(endLineNumber).lineNumber;
        return this.editor
            .getModel()
            .getLinesDecorations(start, end)
            .map(this.toEditorDecoration.bind(this));
    }

    protected toEditorDecoration(decoration: monaco.editor.IModelDecoration): EditorDecoration & Readonly<{ id: string }> {
        const range = this.m2p.asRange(decoration.range);
        const { id, options } = decoration;
        return {
            options,
            range,
            id
        } as EditorDecoration & Readonly<{ id: string }>;
    }

    getVisibleColumn(position: Position): number {
        return this.editor.getVisibleColumnFromPosition(this.p2m.asPosition(position));
    }

    async replaceText(params: ReplaceTextParams): Promise<boolean> {
        const edits: IIdentifiedSingleEditOperation[] = params.replaceOperations.map(param => {
            const range = monaco.Range.fromPositions(this.p2m.asPosition(param.range.start), this.p2m.asPosition(param.range.end));
            return {
                forceMoveMarkers: true,
                identifier: {
                    major: range.startLineNumber,
                    minor: range.startColumn
                },
                range,
                text: param.text
            };
        });
        return this.editor.executeEdits(params.source, edits);
    }

    executeEdits(edits: TextEdit[]): boolean {
        return this.editor.executeEdits('MonacoEditor', this.p2m.asTextEdits(edits) as IIdentifiedSingleEditOperation[]);
    }

    storeViewState(): object {
        return this.editor.saveViewState();
    }

    restoreViewState(state: object): void {
        this.editor.restoreViewState(state as monaco.editor.ICodeEditorViewState);
    }

    async detectLanguage(): Promise<void> {
        const filename = this.uri.path.toString();
        const modeService = monaco.services.StaticServices.modeService.get();
        const firstLine = this.document.textEditorModel.getLineContent(1);
        const mode = await modeService.getOrCreateModeByFilenameOrFirstLine(filename, firstLine);
        this.setLanguage(mode.getId());
    }

    setLanguage(languageId: string): void {
        for (const document of this.documents) {
            monaco.editor.setModelLanguage(document.textEditorModel, languageId);
        }
    }

}

export namespace MonacoEditor {
    export interface ICommonOptions {
        /**
         * Whether an editor should be auto resized on a content change.
         *
         * #### Fixme
         * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
         */
        autoSizing?: boolean;
        /**
         * A minimal height of an editor in lines.
         *
         * #### Fixme
         * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
         */
        minHeight?: number;
        /**
         * A maximal height of an editor in lines.
         *
         * #### Fixme
         * remove when https://github.com/Microsoft/monaco-editor/issues/103 is resolved
         */
        maxHeight?: number;
    }

    export interface IOptions extends ICommonOptions, IEditorConstructionOptions { }

    export function getAll(manager: EditorManager): MonacoEditor[] {
        return manager.all.map(e => get(e)).filter(e => !!e) as MonacoEditor[];
    }

    export function getCurrent(manager: EditorManager): MonacoEditor | undefined {
        return get(manager.currentEditor);
    }

    export function getActive(manager: EditorManager): MonacoEditor | undefined {
        return get(manager.activeEditor);
    }

    export function get(editorWidget: EditorWidget | undefined): MonacoEditor | undefined {
        if (editorWidget && editorWidget.editor instanceof MonacoEditor) {
            return editorWidget.editor;
        }
        return undefined;
    }

    export function findByDocument(manager: EditorManager, document: MonacoEditorModel): MonacoEditor[] {
        return getAll(manager).filter(editor => editor.documents.has(document));
    }

    export function getWidgetFor(manager: EditorManager, control: monaco.editor.ICodeEditor | undefined): EditorWidget | undefined {
        if (!control) {
            return undefined;
        }
        return manager.all.find(widget => {
            const editor = get(widget);
            return !!editor && editor.getControl() === control;
        });
    }
}
