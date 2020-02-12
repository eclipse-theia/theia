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

import { Position } from 'vscode-languageserver-types';
import { TextDocumentSaveReason, TextDocumentContentChangeEvent } from 'vscode-languageserver-protocol';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import { TextEditorDocument } from '@theia/editor/lib/browser';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { CancellationTokenSource, CancellationToken } from '@theia/core/lib/common/cancellation';
import { Resource, ResourceError, ResourceVersion } from '@theia/core/lib/common/resource';
import { Range } from 'vscode-languageserver-types';
import { Saveable } from '@theia/core/lib/browser/saveable';

export {
    TextDocumentSaveReason
};

type ITextEditorModel = monaco.editor.ITextEditorModel;

export interface WillSaveMonacoModelEvent {
    readonly model: MonacoEditorModel;
    readonly reason: TextDocumentSaveReason;
    waitUntil(thenable: Thenable<monaco.editor.IIdentifiedSingleEditOperation[]>): void;
}

export interface MonacoModelContentChangedEvent {
    readonly model: MonacoEditorModel;
    readonly contentChanges: TextDocumentContentChangeEvent[];
}

export class MonacoEditorModel implements ITextEditorModel, TextEditorDocument {

    autoSave: 'on' | 'off' = 'on';
    autoSaveDelay: number = 500;
    /* @deprecated there is no general save timeout, each participant should introduce a sensible timeout  */
    readonly onWillSaveLoopTimeOut = 1500;
    protected bufferSavedVersionId: number;

    protected model: monaco.editor.IModel;
    protected readonly resolveModel: Promise<void>;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnAutoSave = new DisposableCollection();

    protected readonly onDidChangeContentEmitter = new Emitter<MonacoModelContentChangedEvent>();
    readonly onDidChangeContent = this.onDidChangeContentEmitter.event;

    protected readonly onDidSaveModelEmitter = new Emitter<monaco.editor.IModel>();
    readonly onDidSaveModel = this.onDidSaveModelEmitter.event;

    protected readonly onWillSaveModelEmitter = new Emitter<WillSaveMonacoModelEvent>();
    readonly onWillSaveModel = this.onWillSaveModelEmitter.event;

    protected readonly onDidChangeValidEmitter = new Emitter<void>();
    readonly onDidChangeValid = this.onDidChangeValidEmitter.event;

    private preferredEncoding: string | undefined = undefined;
    private readonly defaultEncoding: string | undefined;

    protected resourceVersion: ResourceVersion | undefined;

    constructor(
        protected readonly resource: Resource,
        protected readonly m2p: MonacoToProtocolConverter,
        protected readonly p2m: ProtocolToMonacoConverter,
        options?: { encoding?: string | undefined }
    ) {
        this.toDispose.push(resource);
        this.toDispose.push(this.toDisposeOnAutoSave);
        this.toDispose.push(this.onDidChangeContentEmitter);
        this.toDispose.push(this.onDidSaveModelEmitter);
        this.toDispose.push(this.onWillSaveModelEmitter);
        this.toDispose.push(this.onDirtyChangedEmitter);
        this.toDispose.push(this.onDidChangeValidEmitter);
        this.toDispose.push(Disposable.create(() => this.cancelSave()));
        this.toDispose.push(Disposable.create(() => this.cancelSync()));
        this.defaultEncoding = options && options.encoding ? options.encoding : undefined;
        this.resolveModel = this.readContents().then(
            content => this.initialize(content || ''),
            e => console.error(`Failed to initialize for '${this.uri}':`, e)
        );
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async reopenWithEncoding(encoding: string): Promise<void> {
        if (encoding === this.preferredEncoding || (!this.preferredEncoding && encoding === this.defaultEncoding)) {
            return;
        }
        if (this.dirty) {
            return;
        }
        this.preferredEncoding = encoding;
        return this.sync();
    }

    async saveWithEncoding(encoding: string): Promise<void> {
        return this.scheduleSave(TextDocumentSaveReason.Manual, this.cancelSave(), encoding)
            .then(() => { this.preferredEncoding = encoding; });
    }

    getEncoding(): string | undefined {
        return this.preferredEncoding || this.defaultEncoding;
    }

    /**
     * #### Important
     * Only this method can create an instance of `monaco.editor.IModel`,
     * there should not be other calls to `monaco.editor.createModel`.
     */
    protected initialize(content: string): void {
        if (!this.toDispose.disposed) {
            this.model = monaco.editor.createModel(content, undefined, monaco.Uri.parse(this.resource.uri.toString()));
            this.resourceVersion = this.resource.version;
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
        return this.model.uri.toString();
    }

    protected _languageId: string | undefined;
    get languageId(): string {
        return this._languageId !== undefined ? this._languageId : this.model.getModeId();
    }
    /**
     * It's a hack to dispatch close notification with an old language id, don't use it.
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

    get readOnly(): boolean {
        return this.resource.saveContents === undefined;
    }

    get onDispose(): monaco.IEvent<void> {
        return this.toDispose.onDispose;
    }

    get textEditorModel(): monaco.editor.IModel {
        return this.model;
    }

    async load(): Promise<MonacoEditorModel> {
        await this.resolveModel;
        return this;
    }

    save(): Promise<void> {
        return this.scheduleSave(TextDocumentSaveReason.Manual);
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
        this.syncCancellationTokenSource.cancel();
        this.syncCancellationTokenSource = new CancellationTokenSource();
        return this.syncCancellationTokenSource.token;
    }

    async sync(): Promise<void> {
        const token = this.cancelSync();
        return this.run(() => this.doSync(token));
    }
    protected async doSync(token: CancellationToken): Promise<void> {
        if (token.isCancellationRequested) {
            return;
        }

        const newText = await this.readContents();
        if (newText === undefined || token.isCancellationRequested || this._dirty) {
            return;
        }
        this.resourceVersion = this.resource.version;

        const value = this.model.getValue();
        if (value === newText) {
            return;
        }

        const range = this.m2p.asRange(this.model.getFullModelRange());
        this.applyEdits([this.p2m.asTextEdit({ range, newText }) as monaco.editor.IIdentifiedSingleEditOperation], {
            ignoreDirty: true,
            ignoreContentChanges: true
        });
    }
    protected async readContents(): Promise<string | undefined> {
        try {
            const content = await this.resource.readContents({ encoding: this.getEncoding() });
            this.setValid(true);
            return content;
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
        if (this.ignoreDirtyEdits) {
            return;
        }
        this.cancelSync();
        this.setDirty(true);
        this.doAutoSave();
    }

    protected doAutoSave(): void {
        if (this.autoSave === 'on') {
            const token = this.cancelSave();
            this.toDisposeOnAutoSave.dispose();
            const handle = window.setTimeout(() => {
                this.scheduleSave(TextDocumentSaveReason.AfterDelay, token);
            }, this.autoSaveDelay);
            this.toDisposeOnAutoSave.push(Disposable.create(() =>
                window.clearTimeout(handle))
            );
        }
    }

    protected saveCancellationTokenSource = new CancellationTokenSource();
    protected cancelSave(): CancellationToken {
        this.saveCancellationTokenSource.cancel();
        this.saveCancellationTokenSource = new CancellationTokenSource();
        return this.saveCancellationTokenSource.token;
    }

    protected scheduleSave(reason: TextDocumentSaveReason, token: CancellationToken = this.cancelSave(), overwriteEncoding?: string): Promise<void> {
        return this.run(() => this.doSave(reason, token, overwriteEncoding));
    }

    protected ignoreContentChanges = false;
    protected readonly contentChanges: TextDocumentContentChangeEvent[] = [];
    protected pushContentChanges(contentChanges: TextDocumentContentChangeEvent[]): void {
        if (!this.ignoreContentChanges) {
            this.contentChanges.push(...contentChanges);
        }
    }

    protected fireDidChangeContent(event: monaco.editor.IModelContentChangedEvent): void {
        if (this.model.getAlternativeVersionId() === this.bufferSavedVersionId) {
            this.setDirty(false);
        } else {
            this.markAsDirty();
        }

        const changeContentEvent = this.asContentChangedEvent(event);
        this.onDidChangeContentEmitter.fire(changeContentEvent);
        this.pushContentChanges(changeContentEvent.contentChanges);
    }
    protected asContentChangedEvent(event: monaco.editor.IModelContentChangedEvent): MonacoModelContentChangedEvent {
        const contentChanges = event.changes.map(change => this.asTextDocumentContentChangeEvent(change));
        return { model: this, contentChanges };
    }
    protected asTextDocumentContentChangeEvent(change: monaco.editor.IModelContentChange): TextDocumentContentChangeEvent {
        const range = this.m2p.asRange(change.range);
        const rangeLength = change.rangeLength;
        const text = change.text;
        return { range, rangeLength, text };
    }

    protected applyEdits(
        operations: monaco.editor.IIdentifiedSingleEditOperation[],
        options?: Partial<MonacoEditorModel.ApplyEditsOptions>
    ): monaco.editor.IIdentifiedSingleEditOperation[] {
        const resolvedOptions: MonacoEditorModel.ApplyEditsOptions = {
            ignoreDirty: false,
            ignoreContentChanges: false,
            ...options
        };
        const { ignoreDirtyEdits, ignoreContentChanges } = this;
        this.ignoreDirtyEdits = resolvedOptions.ignoreDirty;
        this.ignoreContentChanges = resolvedOptions.ignoreContentChanges;
        try {
            return this.model.applyEdits(operations);
        } finally {
            this.ignoreDirtyEdits = ignoreDirtyEdits;
            this.ignoreContentChanges = ignoreContentChanges;
        }
    }

    protected async doSave(reason: TextDocumentSaveReason, token: CancellationToken, overwriteEncoding?: string): Promise<void> {
        if (token.isCancellationRequested || !this.resource.saveContents) {
            return;
        }

        await this.fireWillSaveModel(reason, token);
        if (token.isCancellationRequested) {
            return;
        }

        const changes = [...this.contentChanges];
        if (changes.length === 0 && overwriteEncoding === undefined) {
            return;
        }

        const content = this.model.getValue();
        try {
            const encoding = this.getEncoding();
            const version = this.resourceVersion;
            await Resource.save(this.resource, { changes, content, options: { encoding, overwriteEncoding, version } }, token);
            this.contentChanges.splice(0, changes.length);
            this.resourceVersion = this.resource.version;
            this.setValid(true);

            if (token.isCancellationRequested) {
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

    protected async fireWillSaveModel(reason: TextDocumentSaveReason, token: CancellationToken): Promise<void> {
        type EditContributor = Thenable<monaco.editor.IIdentifiedSingleEditOperation[]>;

        const firing = this.onWillSaveModelEmitter.sequence(async listener => {
            if (token.isCancellationRequested) {
                return false;
            }
            const waitables: EditContributor[] = [];
            const { version } = this;

            const event = {
                model: this, reason,
                waitUntil: (thenable: EditContributor) => {
                    if (Object.isFrozen(waitables)) {
                        throw new Error('waitUntil cannot be called asynchronously.');
                    }
                    waitables.push(thenable);
                }
            };

            // Fire.
            try {
                listener(event);
            } catch (err) {
                console.error(err);
                return true;
            }

            // Asynchronous calls to `waitUntil` should fail.
            Object.freeze(waitables);

            // Wait for all promises.
            const edits = await Promise.all(waitables).then(allOperations =>
                ([] as monaco.editor.IIdentifiedSingleEditOperation[]).concat(...allOperations)
            );
            if (token.isCancellationRequested) {
                return false;
            }

            // In a perfect world, we should only apply edits if document is clean.
            if (version !== this.version) {
                console.error('onWillSave listeners should provide edits, not directly alter the document.');
            }

            // Finally apply edits provided by this listener before firing the next.
            if (edits && edits.length > 0) {
                this.applyEdits(edits, {
                    ignoreDirty: true,
                });
            }

            return true;
        });

        try {
            await firing;
        } catch (e) {
            console.error(e);
        }
    }

    protected fireDidSaveModel(): void {
        this.onDidSaveModelEmitter.fire(this.model);
    }

    async revert(options?: Saveable.RevertOptions): Promise<void> {
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
    }

    createSnapshot(): object {
        return {
            value: this.getText()
        };
    }

    applySnapshot(snapshot: { value: string }): void {
        this.model.setValue(snapshot.value);
    }

}
export namespace MonacoEditorModel {
    export interface ApplyEditsOptions {
        ignoreDirty: boolean
        ignoreContentChanges: boolean
    }
}
