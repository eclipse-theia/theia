/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TextDocumentSaveReason, Position } from "vscode-languageserver-types";
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from "monaco-languageclient";
import { TextEditorDocument } from "@theia/editor/lib/browser";
import { DisposableCollection, Disposable, Emitter, Event, Resource, CancellationTokenSource } from '@theia/core/lib/common';
import ITextEditorModel = monaco.editor.ITextEditorModel;

export {
    TextDocumentSaveReason
};

export interface WillSaveModelEvent {
    readonly model: monaco.editor.IModel;
    readonly reason: TextDocumentSaveReason;
    waitUntil(thenable: Thenable<monaco.editor.IIdentifiedSingleEditOperation[]>): void;
}

export class MonacoEditorModel implements ITextEditorModel, TextEditorDocument {

    autoSave: 'on' | 'off' = 'on';
    autoSaveDelay: number = 500;

    protected model: monaco.editor.IModel;
    protected readonly resolveModel: Promise<void>;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnAutoSave = new DisposableCollection();

    protected readonly onDidSaveModelEmitter = new Emitter<monaco.editor.IModel>();
    protected readonly onWillSaveModelEmitter = new Emitter<WillSaveModelEvent>();

    constructor(
        protected readonly resource: Resource,
        protected readonly m2p: MonacoToProtocolConverter,
        protected readonly p2m: ProtocolToMonacoConverter
    ) {
        this.toDispose.push(resource);
        this.toDispose.push(this.toDisposeOnAutoSave);
        this.toDispose.push(this.onDidSaveModelEmitter);
        this.toDispose.push(this.onWillSaveModelEmitter);
        this.toDispose.push(this.onDirtyChangedEmitter);
        this.resolveModel = resource.readContents().then(content => this.initialize(content));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * #### Important
     * Only this method can create an instance of `monaco.editor.IModel`,
     * there should not be other calls to `monaco.editor.createModel`.
     */
    protected initialize(content: string): void {
        if (!this.toDispose.disposed) {
            this.model = monaco.editor.createModel(content, undefined, monaco.Uri.parse(this.resource.uri.toString()));
            this.toDispose.push(this.model);
            this.toDispose.push(this.model.onDidChangeContent(event => this.markAsDirty()));
            if (this.resource.onDidChangeContents) {
                this.toDispose.push(this.resource.onDidChangeContents(() => this.sync()));
            }
        }
    }

    protected _dirty = false;
    get dirty(): boolean {
        return this._dirty;
    }
    protected setDirty(dirty: boolean): void {
        this._dirty = dirty;
        this.onDirtyChangedEmitter.fire(undefined);
    }

    protected readonly onDirtyChangedEmitter = new Emitter<void>();
    get onDirtyChanged(): Event<void> {
        return this.onDirtyChangedEmitter.event;
    }

    get uri(): string {
        return this.model.uri.toString();
    }

    get languageId(): string {
        return this.model.getModeId();
    }

    get version(): number {
        return this.model.getVersionId();
    }

    getText(): string {
        return this.model.getValue();
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

    get readOnly(): boolean {
        return this.resource.saveContents === undefined;
    }

    get onDispose(): monaco.IEvent<void> {
        return this.toDispose.onDispose;
    }

    get textEditorModel(): monaco.editor.IModel {
        return this.model;
    }

    get onWillSaveModel(): Event<WillSaveModelEvent> {
        return this.onWillSaveModelEmitter.event;
    }

    get onDidSaveModel(): Event<monaco.editor.IModel> {
        return this.onDidSaveModelEmitter.event;
    }

    load(): monaco.Promise<MonacoEditorModel> {
        return monaco.Promise.wrap(this.resolveModel).then(() => this);
    }

    save(): Promise<void> {
        return this.doSave(TextDocumentSaveReason.Manual);
    }

    protected syncCancellationTokenSource = new CancellationTokenSource();
    async sync(): Promise<void> {
        this.syncCancellationTokenSource.cancel();
        this.syncCancellationTokenSource = new CancellationTokenSource();
        const cancellationToken = this.syncCancellationTokenSource.token;
        if (this._dirty) {
            return;
        }

        const newText = await this.resource.readContents();
        if (cancellationToken.isCancellationRequested || this._dirty) {
            return;
        }

        const value = this.model.getValue();
        if (value === newText) {
            return;
        }

        this.model.applyEdits([this.p2m.asTextEdit({
            range: this.m2p.asRange(this.model.getFullModelRange()),
            newText
        }) as monaco.editor.IIdentifiedSingleEditOperation]);
    }
    protected markAsDirty(): void {
        this.syncCancellationTokenSource.cancel();
        this.setDirty(true);
        this.doAutoSave();
    }

    protected doAutoSave(): void {
        if (this.autoSave === 'on') {
            this.toDisposeOnAutoSave.dispose();
            const handle = window.setTimeout(() => {
                this.doSave(TextDocumentSaveReason.AfterDelay);
            }, this.autoSaveDelay);
            this.toDisposeOnAutoSave.push(Disposable.create(() =>
                window.clearTimeout(handle))
            );
        }
    }

    protected async doSave(reason: TextDocumentSaveReason): Promise<void> {
        if (this.resource.saveContents) {
            await this.fireWillSaveModel(reason);
            if (this.dirty) {
                const content = this.model.getValue();
                await this.resource.saveContents(content);
                this.setDirty(false);
            }
            this.onDidSaveModelEmitter.fire(this.model);
        }
    }

    protected fireWillSaveModel(reason: TextDocumentSaveReason): Promise<void> {
        const model = this.model;
        return new Promise<void>(resolve => {
            this.onWillSaveModelEmitter.fire({
                model, reason,
                waitUntil: thenable =>
                    thenable.then(operations => {
                        model.applyEdits(operations);
                        resolve();
                    })
            });
        });
    }

    protected fireDidSaveModel(): void {
        this.onDidSaveModelEmitter.fire(this.model);
    }
}
