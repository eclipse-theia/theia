// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { Position, Range, TextDocumentSaveReason } from '@theia/core/shared/vscode-languageserver-protocol';
import { TextEditorDocument, EncodingMode, FindMatchesOptions, FindMatch, EditorPreferences } from '@theia/editor/lib/browser';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { CancellationTokenSource, CancellationToken } from '@theia/core/lib/common/cancellation';
import { Resource, ResourceError, ResourceVersion } from '@theia/core/lib/common/resource';
import { Saveable, SaveOptions, SaveReason } from '@theia/core/lib/browser/saveable';
import { MonacoToProtocolConverter } from './monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from './protocol-to-monaco-converter';
import { ILogger, Loggable, Log } from '@theia/core/lib/common/logger';
import { ITextBufferFactory, ITextModel, ITextSnapshot } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { IResolvedTextEditorModel } from '@theia/monaco-editor-core/esm/vs/editor/common/services/resolverService';
import * as monaco from '@theia/monaco-editor-core';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ILanguageService } from '@theia/monaco-editor-core/esm/vs/editor/common/languages/language';
import { IModelService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/model';
import { createTextBufferFactoryFromStream } from '@theia/monaco-editor-core/esm/vs/editor/common/model/textModel';
import { editorGeneratedPreferenceProperties } from '@theia/editor/lib/browser/editor-generated-preference-schema';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { Listener, ListenerList } from '@theia/core';

export {
    TextDocumentSaveReason
};

export interface WillSaveMonacoModelEvent {
    model: MonacoEditorModel,
    token: CancellationToken,
    options?: SaveOptions
}

export interface MonacoModelContentChangedEvent {
    readonly model: MonacoEditorModel;
    readonly contentChanges: MonacoTextDocumentContentChange[];
}

export interface MonacoTextDocumentContentChange {
    readonly range: Range;
    readonly rangeOffset: number;
    readonly rangeLength: number;
    readonly text: string;
}

export class MonacoEditorModel implements IResolvedTextEditorModel, TextEditorDocument {

    suppressOpenEditorWhenDirty = false;
    lineNumbersMinChars = 3;

    /* @deprecated there is no general save timeout, each participant should introduce a sensible timeout  */
    readonly onWillSaveLoopTimeOut = 1500;
    protected bufferSavedVersionId: number;

    protected model: ITextModel;
    protected readonly resolveModel: Promise<void>;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnAutoSave = new DisposableCollection();

    protected readonly onDidChangeContentEmitter = new Emitter<MonacoModelContentChangedEvent>();
    readonly onDidChangeContent = this.onDidChangeContentEmitter.event;

    get onContentChanged(): Event<void> {
        return (listener, thisArgs, disposables) => this.onDidChangeContent(() => listener(), thisArgs, disposables);
    }

    protected readonly onDidSaveModelEmitter = new Emitter<ITextModel>();
    readonly onDidSaveModel = this.onDidSaveModelEmitter.event;

    protected readonly onDidChangeValidEmitter = new Emitter<void>();
    readonly onDidChangeValid = this.onDidChangeValidEmitter.event;

    protected readonly onDidChangeEncodingEmitter = new Emitter<string>();
    readonly onDidChangeEncoding = this.onDidChangeEncodingEmitter.event;

    readonly onDidChangeReadOnly: Event<boolean | MarkdownString> = this.resource.onDidChangeReadOnly ?? Event.None;

    private preferredEncoding: string | undefined;
    private contentEncoding: string | undefined;

    protected resourceVersion: ResourceVersion | undefined;

    protected readonly onWillSaveModelListeners: ListenerList<WillSaveMonacoModelEvent, Promise<void>> = new ListenerList;
    readonly onModelWillSaveModel = this.onWillSaveModelListeners.registration;

    constructor(
        protected readonly resource: Resource,
        protected readonly m2p: MonacoToProtocolConverter,
        protected readonly p2m: ProtocolToMonacoConverter,
        protected readonly logger?: ILogger,
        protected readonly editorPreferences?: EditorPreferences
    ) {
        this.toDispose.push(resource);
        this.toDispose.push(this.toDisposeOnAutoSave);
        this.toDispose.push(this.onDidChangeContentEmitter);
        this.toDispose.push(this.onDidSaveModelEmitter);
        this.toDispose.push(this.onDirtyChangedEmitter);
        this.toDispose.push(this.onDidChangeEncodingEmitter);
        this.toDispose.push(this.onDidChangeValidEmitter);
        this.toDispose.push(Disposable.create(() => this.cancelSave()));
        this.toDispose.push(Disposable.create(() => this.cancelSync()));
        this.resolveModel = this.readContents().then(
            content => this.initialize(content || '')
        );
    }

    undo(): void {
        this.model.undo();
    }

    redo(): void {
        this.model.redo();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    isDisposed(): boolean {
        return this.toDispose.disposed;
    }

    resolve(): Promise<void> {
        return this.resolveModel;
    }

    isResolved(): boolean {
        return Boolean(this.model);
    }

    setEncoding(encoding: string, mode: EncodingMode): Promise<void> {
        if (mode === EncodingMode.Decode && this.dirty) {
            return Promise.resolve();
        }
        if (!this.setPreferredEncoding(encoding)) {
            return Promise.resolve();
        }
        if (mode === EncodingMode.Decode) {
            return this.sync();
        }
        return this.scheduleSave(this.cancelSave(), true, { saveReason: SaveReason.Manual });
    }

    getEncoding(): string | undefined {
        return this.preferredEncoding || this.contentEncoding;
    }

    protected setPreferredEncoding(encoding: string): boolean {
        if (encoding === this.preferredEncoding || (!this.preferredEncoding && encoding === this.contentEncoding)) {
            return false;
        }
        this.preferredEncoding = encoding;
        this.onDidChangeEncodingEmitter.fire(encoding);
        return true;
    }

    protected updateContentEncoding(): void {
        const contentEncoding = this.resource.encoding;
        if (!contentEncoding || this.contentEncoding === contentEncoding) {
            return;
        }
        this.contentEncoding = contentEncoding;
        if (!this.preferredEncoding) {
            this.onDidChangeEncodingEmitter.fire(contentEncoding);
        }
    }

    /**
     * #### Important
     * Only this method can create an instance of `monaco.editor.IModel`,
     * there should not be other calls to `monaco.editor.createModel`.
     */
    protected initialize(value: string | ITextBufferFactory): void {
        if (!this.toDispose.disposed) {
            const uri = monaco.Uri.parse(this.resource.uri.toString());
            let firstLine;
            if (typeof value === 'string') {
                firstLine = value;
                const firstLF = value.indexOf('\n');
                if (firstLF !== -1) {
                    firstLine = value.substring(0, firstLF);
                }
            } else {
                firstLine = value.getFirstLineText(1000);
            }
            const languageSelection = StandaloneServices.get(ILanguageService).createByFilepathOrFirstLine(uri, firstLine);
            this.model = StandaloneServices.get(IModelService).createModel(value, languageSelection, uri);
            this.resourceVersion = this.resource.version;
            this.setDirty(this._dirty || (!!this.resource.initiallyDirty));
            this.updateSavedVersionId();
            this.toDispose.push(this.model);
            this.toDispose.push(this.model.onDidChangeContent(event => this.fireDidChangeContent(event)));
            if (this.resource.onDidChangeContents) {
                this.toDispose.push(this.resource.onDidChangeContents(() => this.sync()));
            }
        }
    }

    /**
     * Use `valid` to access it.
     * Use `setValid` to mutate it.
     */
    protected _valid = false;
    /**
     * Whether it is possible to load content from the underlying resource.
     */
    get valid(): boolean {
        return this._valid;
    }
    protected setValid(valid: boolean): void {
        if (valid === this._valid) {
            return;
        }
        this._valid = valid;
        this.onDidChangeValidEmitter.fire(undefined);
    }

    protected _dirty = false;
    get dirty(): boolean {
        return this._dirty;
    }
    protected setDirty(dirty: boolean): void {
        if (dirty === this._dirty) {
            return;
        }
        this._dirty = dirty;
        if (dirty === false) {
            this.updateSavedVersionId();
        }
        this.onDirtyChangedEmitter.fire(undefined);
    }

    private updateSavedVersionId(): void {
        this.bufferSavedVersionId = this.model.getAlternativeVersionId();
    }

    protected readonly onDirtyChangedEmitter = new Emitter<void>();
    get onDirtyChanged(): Event<void> {
        return this.onDirtyChangedEmitter.event;
    }

    get uri(): string {
        return this.resource.uri.toString();
    }

    get autosaveable(): boolean | undefined {
        return this.resource.autosaveable;
    }

    protected _languageId: string | undefined;
    get languageId(): string {
        return this._languageId !== undefined ? this._languageId : this.model.getLanguageId();
    }

    getLanguageId(): string | undefined {
        return this.languageId;
    }

    /**
     * It's a hack to dispatch close notification with an old language id; don't use it.
     */
    setLanguageId(languageId: string | undefined): void {
        this._languageId = languageId;
    }

    get version(): number {
        return this.model.getVersionId();
    }

    /**
     * Return selected text by Range or all text by default
     */
    getText(range?: Range): string {
        if (!range) {
            return this.model.getValue();
        } else {
            return this.model.getValueInRange(this.p2m.asRange(range));
        }
    }

    positionAt(offset: number): Position {
        const { lineNumber, column } = this.model.getPositionAt(offset);
        return this.m2p.asPosition(lineNumber, column);
    }

    offsetAt(position: Position): number {
        return this.model.getOffsetAt(this.p2m.asPosition(position));
    }

    get lineCount(): number {
        return this.model.getLineCount();
    }

    /**
     * Retrieves a line in a text document expressed as a one-based position.
     */
    getLineContent(lineNumber: number): string {
        return this.model.getLineContent(lineNumber);
    }

    getLineMaxColumn(lineNumber: number): number {
        return this.model.getLineMaxColumn(lineNumber);
    }

    toValidPosition(position: Position): Position {
        const { lineNumber, column } = this.model.validatePosition(this.p2m.asPosition(position));
        return this.m2p.asPosition(lineNumber, column);
    }

    toValidRange(range: Range): Range {
        return this.m2p.asRange(this.model.validateRange(this.p2m.asRange(range)));
    }

    get readOnly(): boolean | MarkdownString {
        return this.resource.readOnly ?? false;
    }

    isReadonly(): boolean | MarkdownString {
        return this.readOnly;
    }

    get onDispose(): monaco.IEvent<void> {
        return this.toDispose.onDispose;
    }

    get onWillDispose(): Event<void> {
        return this.toDispose.onDispose;
    }

    // We have a TypeScript problem here. There is a const enum `DefaultEndOfLine` used for ITextModel and a non-const redeclaration of that enum in the public API in
    // Monaco.editor. The values will be the same, but TS won't accept that the two enums are equivalent, so it says these types are irreconcilable.
    get textEditorModel(): monaco.editor.ITextModel & ITextModel {
        // @ts-expect-error ts(2322)
        return this.model;
    }

    /**
     * Find all matches in an editor for the given options.
     * @param options the options for finding matches.
     *
     * @returns the list of matches.
     */
    findMatches(options: FindMatchesOptions): FindMatch[] {
        const wordSeparators = this.editorPreferences?.['editor.wordSeparators'] ?? editorGeneratedPreferenceProperties['editor.wordSeparators'].default as string;
        const results: monaco.editor.FindMatch[] = this.model.findMatches(
            options.searchString,
            false,
            options.isRegex,
            options.matchCase,
            // eslint-disable-next-line no-null/no-null
            options.matchWholeWord ? wordSeparators : null,
            true,
            options.limitResultCount
        );
        const extractedMatches: FindMatch[] = [];
        results.forEach(r => {
            if (r.matches) {
                extractedMatches.push({
                    matches: r.matches,
                    range: Range.create(r.range.startLineNumber, r.range.startColumn, r.range.endLineNumber, r.range.endColumn)
                });
            }
        });
        return extractedMatches;
    }

    async load(): Promise<MonacoEditorModel> {
        await this.resolveModel;
        return this;
    }

    save(options?: SaveOptions): Promise<void> {
        return this.scheduleSave(undefined, undefined, {
            saveReason: TextDocumentSaveReason.Manual,
            ...options
        });
    }

    protected pendingOperation = Promise.resolve();
    protected async run(operation: () => Promise<void>): Promise<void> {
        if (this.toDispose.disposed) {
            return;
        }
        return this.pendingOperation = this.pendingOperation.then(async () => {
            try {
                await operation();
            } catch (e) {
                console.error(e);
            }
        });
    }

    protected syncCancellationTokenSource = new CancellationTokenSource();
    protected cancelSync(): CancellationToken {
        this.trace(log => log('MonacoEditorModel.cancelSync'));
        this.syncCancellationTokenSource.cancel();
        this.syncCancellationTokenSource = new CancellationTokenSource();
        return this.syncCancellationTokenSource.token;
    }

    async sync(): Promise<void> {
        const token = this.cancelSync();
        return this.run(() => this.doSync(token));
    }
    protected async doSync(token: CancellationToken): Promise<void> {
        this.trace(log => log('MonacoEditorModel.doSync - enter'));
        if (token.isCancellationRequested) {
            this.trace(log => log('MonacoEditorModel.doSync - exit - cancelled'));
            return;
        }

        const value = await this.readContents();
        if (value === undefined) {
            this.trace(log => log('MonacoEditorModel.doSync - exit - resource not found'));
            return;
        }
        if (token.isCancellationRequested) {
            this.trace(log => log('MonacoEditorModel.doSync - exit - cancelled while looking for a resource'));
            return;
        }
        if (this._dirty) {
            this.trace(log => log('MonacoEditorModel.doSync - exit - pending dirty changes'));
            return;
        }

        this.resourceVersion = this.resource.version;
        this.updateModel(() => StandaloneServices.get(IModelService).updateModel(this.model, value), {
            ignoreDirty: true,
            ignoreContentChanges: true
        });
        this.trace(log => log('MonacoEditorModel.doSync - exit'));
    }
    protected async readContents(): Promise<string | ITextBufferFactory | undefined> {
        try {
            const options = { encoding: this.getEncoding() };
            const content = await (this.resource.readStream ? this.resource.readStream(options) : this.resource.readContents(options));
            let value;
            if (typeof content === 'string') {
                value = content;
            } else {
                value = createTextBufferFactoryFromStream(content);
            }
            this.updateContentEncoding();
            this.setValid(true);
            return value;
        } catch (e) {
            this.setValid(false);
            if (ResourceError.NotFound.is(e)) {
                return undefined;
            }
            throw e;
        }
    }

    protected ignoreDirtyEdits = false;
    protected markAsDirty(): void {
        this.trace(log => log('MonacoEditorModel.markAsDirty - enter'));
        if (this.ignoreDirtyEdits) {
            this.trace(log => log('MonacoEditorModel.markAsDirty - exit - ignoring dirty changes enabled'));
            return;
        }
        this.cancelSync();
        this.setDirty(true);
        this.trace(log => log('MonacoEditorModel.markAsDirty - exit'));
    }

    protected saveCancellationTokenSource = new CancellationTokenSource();
    protected cancelSave(): CancellationToken {
        this.trace(log => log('MonacoEditorModel.cancelSave'));
        this.saveCancellationTokenSource.cancel();
        this.saveCancellationTokenSource = new CancellationTokenSource();
        return this.saveCancellationTokenSource.token;
    }

    protected scheduleSave(token: CancellationToken = this.cancelSave(), overwriteEncoding?: boolean, options?: SaveOptions): Promise<void> {
        return this.run(() => this.doSave(token, overwriteEncoding, options));
    }

    protected ignoreContentChanges = false;
    protected readonly contentChanges: MonacoTextDocumentContentChange[] = [];
    protected pushContentChanges(contentChanges: MonacoTextDocumentContentChange[]): void {
        if (!this.ignoreContentChanges) {
            this.contentChanges.push(...contentChanges);
        }
    }

    protected fireDidChangeContent(event: monaco.editor.IModelContentChangedEvent): void {
        this.trace(log => log(`MonacoEditorModel.fireDidChangeContent - enter - ${JSON.stringify(event, undefined, 2)}`));
        if (this.model.getAlternativeVersionId() === this.bufferSavedVersionId) {
            this.setDirty(false);
        } else {
            this.markAsDirty();
        }

        const changeContentEvent = this.asContentChangedEvent(event);
        this.onDidChangeContentEmitter.fire(changeContentEvent);
        this.pushContentChanges(changeContentEvent.contentChanges);
        this.trace(log => log('MonacoEditorModel.fireDidChangeContent - exit'));
    }
    protected asContentChangedEvent(event: monaco.editor.IModelContentChangedEvent): MonacoModelContentChangedEvent {
        const contentChanges = event.changes.map(change => this.asTextDocumentContentChangeEvent(change));
        return { model: this, contentChanges };
    }
    protected asTextDocumentContentChangeEvent(change: monaco.editor.IModelContentChange): MonacoTextDocumentContentChange {
        const range = this.m2p.asRange(change.range);
        const rangeOffset = change.rangeOffset;
        const rangeLength = change.rangeLength;
        const text = change.text;
        return { range, rangeOffset, rangeLength, text };
    }

    protected applyEdits(
        operations: monaco.editor.IIdentifiedSingleEditOperation[],
        options?: Partial<MonacoEditorModel.ApplyEditsOptions>
    ): void {
        return this.updateModel(() => this.model.applyEdits(operations), options);
    }

    protected updateModel<T>(doUpdate: () => T, options?: Partial<MonacoEditorModel.ApplyEditsOptions>): T {
        const resolvedOptions: MonacoEditorModel.ApplyEditsOptions = {
            ignoreDirty: false,
            ignoreContentChanges: false,
            ...options
        };
        const { ignoreDirtyEdits, ignoreContentChanges } = this;
        this.ignoreDirtyEdits = resolvedOptions.ignoreDirty;
        this.ignoreContentChanges = resolvedOptions.ignoreContentChanges;
        try {
            return doUpdate();
        } finally {
            this.ignoreDirtyEdits = ignoreDirtyEdits;
            this.ignoreContentChanges = ignoreContentChanges;
        }
    }

    protected async doSave(token: CancellationToken, overwriteEncoding?: boolean, options?: SaveOptions): Promise<void> {
        if (token.isCancellationRequested || !this.resource.saveContents) {
            return;
        }

        await this.fireWillSaveModel(token, options);
        if (token.isCancellationRequested) {
            return;
        }

        const changes = [...this.contentChanges];
        if ((changes.length === 0 && !this.resource.initiallyDirty) && !overwriteEncoding && options?.saveReason !== TextDocumentSaveReason.Manual) {
            return;
        }

        const currentToSaveVersion = this.model.getAlternativeVersionId();
        const contentLength = this.model.getValueLength();
        const content = this.model.getValue();
        try {
            const encoding = this.getEncoding();
            const version = this.resourceVersion;
            await Resource.save(this.resource, { changes, content, contentLength, options: { encoding, overwriteEncoding, version } }, token);
            this.contentChanges.splice(0, changes.length);
            this.resourceVersion = this.resource.version;
            this.updateContentEncoding();
            this.setValid(true);

            if (token.isCancellationRequested && this.model.getAlternativeVersionId() !== currentToSaveVersion) {
                return;
            }

            this.setDirty(false);
            this.fireDidSaveModel();
        } catch (e) {
            if (!ResourceError.OutOfSync.is(e)) {
                throw e;
            }
        }
    }

    protected async fireWillSaveModel(token: CancellationToken, options?: SaveOptions): Promise<void> {
        await Listener.await({ model: this, token, options }, this.onWillSaveModelListeners);
    }

    protected fireDidSaveModel(): void {
        this.onDidSaveModelEmitter.fire(this.model);
    }

    async revert(options?: Saveable.RevertOptions): Promise<void> {
        this.trace(log => log('MonacoEditorModel.revert - enter'));
        this.cancelSave();
        const soft = options && options.soft;
        if (soft !== true) {
            const dirty = this._dirty;
            this._dirty = false;
            try {
                await this.sync();
            } finally {
                this._dirty = dirty;
            }
        }
        this.setDirty(false);
        this.trace(log => log('MonacoEditorModel.revert - exit'));
    }

    createSnapshot(preserveBOM?: boolean): ITextSnapshot {
        return { read: () => this.model.getValue(undefined, preserveBOM) };
    }

    applySnapshot(snapshot: Saveable.Snapshot): void {
        const value = Saveable.Snapshot.read(snapshot) ?? '';
        this.model.setValue(value);
    }

    async serialize(): Promise<BinaryBuffer> {
        return BinaryBuffer.fromString(this.model.getValue());
    }

    protected trace(loggable: Loggable): void {
        if (this.logger) {
            this.logger.debug((log: Log) =>
                loggable((message, ...params) => log(message, ...params, this.resource.uri.toString(true)))
            );
        }
    }

}
export namespace MonacoEditorModel {
    export interface ApplyEditsOptions {
        ignoreDirty: boolean
        ignoreContentChanges: boolean
    }
}
