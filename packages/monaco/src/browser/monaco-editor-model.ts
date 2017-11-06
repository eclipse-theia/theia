/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TextDocumentSaveReason } from "vscode-languageserver-types";
import { DisposableCollection, Disposable, Emitter, Event, Resource } from '@theia/core/lib/common';
import ITextEditorModel = monaco.editor.ITextEditorModel;

export {
    TextDocumentSaveReason
}

export interface WillSaveModelEvent {
    readonly model: monaco.editor.IModel;
    readonly reason: TextDocumentSaveReason;
    waitUntil(thenable: Thenable<monaco.editor.IIdentifiedSingleEditOperation[]>): void;
}

export class MonacoEditorModel implements ITextEditorModel {

    autoSave: 'on' |  'off' = 'on';
    autoSaveDelay: number = 500;

    protected model: monaco.editor.IModel;
    protected readonly resolveModel: Promise<void>;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnAutoSave = new DisposableCollection();

    protected readonly onDidSaveModelEmitter = new Emitter<monaco.editor.IModel>();
    protected readonly onWillSaveModelEmitter = new Emitter<WillSaveModelEvent>();

    constructor(protected readonly resource: Resource) {
        this.toDispose.push(resource);
        this.toDispose.push(this.toDisposeOnAutoSave);
        this.toDispose.push(this.onDidSaveModelEmitter);
        this.toDispose.push(this.onWillSaveModelEmitter);
        this.resolveModel = resource.readContents().then(content => this.initialize(content));
    }

    /**
     * #### Important
     * Only this method can create an instance of `monaco.editor.IModel`,
     * there should not be other calls to `monaco.editor.createModel`.
     */
    protected initialize(content: string) {
        if (!this.toDispose.disposed) {
            this.model = monaco.editor.createModel(content, undefined, monaco.Uri.parse(this.resource.uri.toString()))
            this.toDispose.push(this.model);
            this.toDispose.push(this.model.onDidChangeContent(event => this.doAutoSave()));
        }
    }

    dispose(): void {
        this.toDispose.dispose();
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

    protected doSave(reason: TextDocumentSaveReason): Promise<void> {
        return new Promise<void>(resolve => {
            if (this.resource.saveContents) {
                const save = this.resource.saveContents.bind(this.resource);
                this.fireWillSaveModel(reason).then(() => {
                    const content = this.model.getValue();
                    resolve(save(content).then(() =>
                        this.onDidSaveModelEmitter.fire(this.model)
                    ));
                });
            }
        });
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
