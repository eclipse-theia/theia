// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, unmanaged } from '@theia/core/shared/inversify';
import { ElementExt } from '@theia/core/shared/@phosphor/domutils';
import URI from '@theia/core/lib/common/uri';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DisposableCollection, Disposable, Emitter, Event, nullToUndefined, MaybeNull } from '@theia/core/lib/common';
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
    EditorMouseEvent,
    EncodingMode,
    EditorDecorationOptions
} from '@theia/editor/lib/browser';
import { MonacoEditorModel } from './monaco-editor-model';
import { MonacoToProtocolConverter } from './monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from './protocol-to-monaco-converter';
import { TextEdit } from '@theia/core/shared/vscode-languageserver-protocol';
import { UTF8 } from '@theia/core/lib/common/encodings';
import * as monaco from '@theia/monaco-editor-core';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ILanguageService } from '@theia/monaco-editor-core/esm/vs/editor/common/languages/language';
import { IInstantiationService, ServiceIdentifier } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { ICodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorBrowser';
import { ServiceCollection } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/serviceCollection';
import { IStandaloneEditorConstructionOptions, StandaloneEditor } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneCodeEditor';

export type ServicePair<T> = [ServiceIdentifier<T>, T];

export interface EditorServiceOverrides extends Iterable<ServicePair<unknown>> { }

@injectable()
export class MonacoEditorServices {

    @inject(MonacoToProtocolConverter)
    protected readonly m2p: MonacoToProtocolConverter;

    @inject(ProtocolToMonacoConverter)
    protected readonly p2m: ProtocolToMonacoConverter;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    constructor(@unmanaged() services: MonacoEditorServices) {
        Object.assign(this, services);
    }
}

export class MonacoEditor extends MonacoEditorServices implements TextEditor {

    protected readonly toDispose = new DisposableCollection();

    protected readonly autoSizing: boolean;
    protected readonly minHeight: number;
    protected readonly maxHeight: number;
    protected editor: monaco.editor.IStandaloneCodeEditor;

    protected readonly onCursorPositionChangedEmitter = new Emitter<Position>();
    protected readonly onSelectionChangedEmitter = new Emitter<Range>();
    protected readonly onFocusChangedEmitter = new Emitter<boolean>();
    protected readonly onDocumentContentChangedEmitter = new Emitter<TextDocumentChangeEvent>();
    protected readonly onMouseDownEmitter = new Emitter<EditorMouseEvent>();
    protected readonly onLanguageChangedEmitter = new Emitter<string>();
    readonly onLanguageChanged = this.onLanguageChangedEmitter.event;
    protected readonly onScrollChangedEmitter = new Emitter<void>();
    readonly onEncodingChanged = this.document.onDidChangeEncoding;
    protected readonly onResizeEmitter = new Emitter<Dimension | null>();
    readonly onDidResize = this.onResizeEmitter.event;

    readonly documents = new Set<MonacoEditorModel>();

    constructor(
        readonly uri: URI,
        readonly document: MonacoEditorModel,
        readonly node: HTMLElement,
        services: MonacoEditorServices,
        options?: MonacoEditor.IOptions,
        override?: EditorServiceOverrides
    ) {
        super(services);
        this.toDispose.pushAll([
            this.onCursorPositionChangedEmitter,
            this.onSelectionChangedEmitter,
            this.onFocusChangedEmitter,
            this.onDocumentContentChangedEmitter,
            this.onMouseDownEmitter,
            this.onLanguageChangedEmitter,
            this.onScrollChangedEmitter
        ]);
        this.documents.add(document);
        this.autoSizing = options && options.autoSizing !== undefined ? options.autoSizing : false;
        this.minHeight = options && options.minHeight !== undefined ? options.minHeight : -1;
        this.maxHeight = options && options.maxHeight !== undefined ? options.maxHeight : -1;
        this.toDispose.push(this.create(options, override));
        this.addHandlers(this.editor);
    }

    getEncoding(): string {
        return this.document.getEncoding() || UTF8;
    }

    setEncoding(encoding: string, mode: EncodingMode): Promise<void> {
        return this.document.setEncoding(encoding, mode);
    }

    protected create(options?: monaco.editor.IStandaloneEditorConstructionOptions | IStandaloneEditorConstructionOptions, override?: EditorServiceOverrides): Disposable {
        const combinedOptions = {
            ...options,
            lightbulb: { enabled: true },
            fixedOverflowWidgets: true,
            scrollbar: {
                useShadows: false,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
                ...options?.scrollbar,
            }
        } as IStandaloneEditorConstructionOptions;
        const instantiator = this.getInstantiatorWithOverrides(override);
        /**
         * @monaco-uplift. Should be guaranteed to work.
         * Incomparable enums prevent TypeScript from believing that public IStandaloneCodeEditor is satisfied by private StandaloneCodeEditor
         */
        return this.editor = instantiator.createInstance(StandaloneEditor, this.node, combinedOptions) as unknown as monaco.editor.IStandaloneCodeEditor;
    }

    protected getInstantiatorWithOverrides(override?: EditorServiceOverrides): IInstantiationService {
        const instantiator = StandaloneServices.initialize({});
        if (override) {
            const overrideServices = new ServiceCollection(...override);
            return instantiator.createChild(overrideServices);
        }
        return instantiator;
    }

    protected addHandlers(codeEditor: monaco.editor.IStandaloneCodeEditor): void {
        this.toDispose.push(codeEditor.onDidChangeModelLanguage(e =>
            this.fireLanguageChanged(e.newLanguage)
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
            const { element, position, range } = e.target;
            this.onMouseDownEmitter.fire({
                target: {
                    ...e.target,
                    element: element || undefined,
                    mouseColumn: this.m2p.asPosition(undefined, e.target.mouseColumn).character,
                    range: range && this.m2p.asRange(range) || undefined,
                    position: position && this.m2p.asPosition(position.lineNumber, position.column) || undefined,
                    detail: (e.target as monaco.editor.IMouseTargetMargin).detail || {},
                },
                event: e.event.browserEvent
            });
        }));
        this.toDispose.push(codeEditor.onDidScrollChange(e => {
            this.onScrollChangedEmitter.fire(undefined);
        }));
    }

    getVisibleRanges(): Range[] {
        return this.editor.getVisibleRanges().map(range => this.m2p.asRange(range));
    }

    protected mapModelContentChange(change: monaco.editor.IModelContentChange): TextDocumentContentChangeDelta {
        return {
            range: this.m2p.asRange(change.range),
            rangeLength: change.rangeLength,
            text: change.text
        };
    }

    get onDispose(): Event<void> {
        return this.toDispose.onDispose;
    }

    get onDocumentContentChanged(): Event<TextDocumentChangeEvent> {
        return this.onDocumentContentChangedEmitter.event;
    }

    get isReadonly(): boolean {
        return this.document.isReadonly();
    }

    get cursor(): Position {
        const { lineNumber, column } = this.editor.getPosition()!;
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
        return this.m2p.asRange(this.editor.getSelection()!);
    }

    set selection(selection: Range) {
        const range = this.p2m.asRange(selection);
        this.editor.setSelection(range);
    }

    get onSelectionChanged(): Event<Range> {
        return this.onSelectionChangedEmitter.event;
    }

    get onScrollChanged(): Event<void> {
        return this.onScrollChangedEmitter.event;
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

    focus(): void {
        /**
         * `this.editor.focus` forcefully changes the focus editor state,
         * regardless whether the textarea actually received the focus.
         * It could lead to issues like https://github.com/eclipse-theia/theia/issues/7902
         * Instead we focus the underlying textarea.
         */
        const node = this.editor.getDomNode();
        if (node) {
            const textarea = node.querySelector('textarea') as HTMLElement;
            textarea.focus();
        }
    }

    blur(): void {
        const node = this.editor.getDomNode();
        if (node) {
            const textarea = node.querySelector('textarea') as HTMLElement;
            textarea.blur();
        }
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
        return this.contextKeyService.match('suggestWidgetVisible', this.editor.getDomNode() || this.node);
    }

    /**
     * `true` if the find (and replace) widget is visible in the editor. Otherwise, `false`.
     */
    isFindWidgetVisible(): boolean {
        return this.contextKeyService.match('findWidgetVisible', this.editor.getDomNode() || this.node);
    }

    /**
     * `true` if the name rename refactoring input HTML element is visible. Otherwise, `false`.
     */
    isRenameInputVisible(): boolean {
        return this.contextKeyService.match('renameInputVisible', this.editor.getDomNode() || this.node);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trigger(source: string, handlerId: string, payload: any): void {
        this.editor.trigger(source, handlerId, payload);
    }

    getControl(): monaco.editor.IStandaloneCodeEditor {
        return this.editor;
    }

    refresh(): void {
        this.autoresize();
    }

    resizeToFit(): void {
        this.autoresize();
        // eslint-disable-next-line no-null/no-null
        this.onResizeEmitter.fire(null);
    }

    setSize(dimension: Dimension): void {
        this.resize(dimension);
        this.onResizeEmitter.fire(dimension);
    }

    protected autoresize(): void {
        if (this.autoSizing) {
            // eslint-disable-next-line no-null/no-null
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

    protected getWidth(hostNode: HTMLElement, boxSizing: ElementExt.IBoxSizing): number {
        return hostNode.offsetWidth - boxSizing.horizontalSum;
    }

    protected getHeight(hostNode: HTMLElement, boxSizing: ElementExt.IBoxSizing): number {
        if (!this.autoSizing) {
            return hostNode.offsetHeight - boxSizing.verticalSum;
        }

        const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        const lineCount = this.editor.getModel()!.getLineCount();
        const contentHeight = lineHeight * lineCount;

        const horizontalScrollbarHeight = this.editor.getLayoutInfo().horizontalScrollbarHeight;

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

    async runAction(id: string): Promise<void> {
        const action = this.editor.getAction(id);
        if (action && action.isSupported()) {
            await action.run();
        }
    }

    deltaDecorations(params: DeltaDecorationParams): string[] {
        const oldDecorations = params.oldDecorations;
        const newDecorations = this.toDeltaDecorations(params);
        return this.editor.deltaDecorations(oldDecorations, newDecorations);
    }

    protected toDeltaDecorations(params: DeltaDecorationParams): monaco.editor.IModelDeltaDecoration[] {
        return params.newDecorations.map(({ options: theiaOptions, range }) => {
            const options: monaco.editor.IModelDecorationOptions = {
                ...theiaOptions,
                hoverMessage: this.fromStringToMarkdownString(theiaOptions.hoverMessage),
                glyphMarginHoverMessage: this.fromStringToMarkdownString(theiaOptions.glyphMarginHoverMessage)
            };
            return {
                options,
                range: this.p2m.asRange(range),
            };
        });
    }

    protected fromStringToMarkdownString(hoverMessage?: string | monaco.IMarkdownString | monaco.IMarkdownString[]): monaco.IMarkdownString | monaco.IMarkdownString[] | undefined {
        if (typeof hoverMessage === 'string') {
            return { value: hoverMessage };
        }
        return hoverMessage;
    }

    protected fromMarkdownToString(maybeMarkdown?: null | string | monaco.IMarkdownString | monaco.IMarkdownString[]): string | undefined {
        if (!maybeMarkdown) {
            return undefined;
        }
        if (typeof maybeMarkdown === 'string') {
            return maybeMarkdown;
        }
        if (Array.isArray(maybeMarkdown)) {
            return maybeMarkdown.map(({ value }) => value).join('\n');
        }
        return maybeMarkdown.value;
    }

    getLinesDecorations(startLineNumber: number, endLineNumber: number): (EditorDecoration & Readonly<{ id: string }>)[] {
        const toPosition = (line: number): monaco.Position => this.p2m.asPosition({ line, character: 0 });
        const start = toPosition(startLineNumber).lineNumber;
        const end = toPosition(endLineNumber).lineNumber;
        return this.editor
            .getModel()!
            .getLinesDecorations(start, end)
            .map(this.toEditorDecoration.bind(this));
    }

    protected toEditorDecoration(decoration: monaco.editor.IModelDecoration): EditorDecoration & Readonly<{ id: string }> {
        const range = this.m2p.asRange(decoration.range);
        const { id, options: monacoOptions } = decoration;
        const options: MaybeNull<EditorDecorationOptions> = {
            ...monacoOptions,
            hoverMessage: this.fromMarkdownToString(monacoOptions.hoverMessage),
            glyphMarginHoverMessage: this.fromMarkdownToString(monacoOptions.hoverMessage),
        };
        return {
            options: nullToUndefined(options),
            range,
            id
        };
    }

    getVisibleColumn(position: Position): number {
        return this.editor.getVisibleColumnFromPosition(this.p2m.asPosition(position));
    }

    async replaceText(params: ReplaceTextParams): Promise<boolean> {
        const edits: monaco.editor.IIdentifiedSingleEditOperation[] = params.replaceOperations.map(param => {
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
        return this.editor.executeEdits('MonacoEditor', this.p2m.asTextEdits(edits) as monaco.editor.IIdentifiedSingleEditOperation[]);
    }

    storeViewState(): object {
        return this.editor.saveViewState()!;
    }

    restoreViewState(state: monaco.editor.ICodeEditorViewState): void {
        this.editor.restoreViewState(state);
    }

    /* `true` because it is derived from an URI during the instantiation */
    protected _languageAutoDetected = true;

    get languageAutoDetected(): boolean {
        return this._languageAutoDetected;
    }

    async detectLanguage(): Promise<void> {
        const languageService = StandaloneServices.get(ILanguageService);
        const firstLine = this.document.textEditorModel.getLineContent(1);
        const model = this.getControl().getModel();
        const language = languageService.createByFilepathOrFirstLine(model && model.uri, firstLine);
        this.setLanguage(language.languageId);
        this._languageAutoDetected = true;
    }

    setLanguage(languageId: string): void {
        for (const document of this.documents) {
            monaco.editor.setModelLanguage(document.textEditorModel, languageId);
        }
    }

    protected fireLanguageChanged(languageId: string): void {
        this._languageAutoDetected = false;
        this.onLanguageChangedEmitter.fire(languageId);
    }

    getResourceUri(): URI {
        return this.uri;
    }
    createMoveToUri(resourceUri: URI): URI {
        return this.uri.withPath(resourceUri.path);
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

    export interface IOptions extends ICommonOptions, monaco.editor.IStandaloneEditorConstructionOptions { }

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
        return getAll(manager).filter(candidate => candidate.documents.has(document));
    }

    export function getWidgetFor(manager: EditorManager, control: monaco.editor.ICodeEditor | ICodeEditor | undefined | null): EditorWidget | undefined {
        if (!control) {
            return undefined;
        }
        return manager.all.find(widget => {
            const candidate = get(widget);
            return candidate && candidate.getControl() === control;
        });
    }
}
