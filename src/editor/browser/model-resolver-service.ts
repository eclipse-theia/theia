/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { TextDocumentSaveReason } from "vscode-languageserver-types";
import { Disposable, DisposableCollection, Emitter, Event } from '../../application/common';
import { FileSystem, FileStat } from '../../filesystem/common';
import ITextModelResolverService = monaco.editor.ITextModelResolverService;
import ITextModelContentProvider = monaco.editor.ITextModelContentProvider;
import ITextEditorModel = monaco.editor.ITextEditorModel;
import IReference = monaco.editor.IReference;
import IDisposable = monaco.IDisposable;
import Uri = monaco.Uri;

export interface WillSaveModelEvent {
    readonly model: monaco.editor.IModel;
    readonly reason: TextDocumentSaveReason;
    waitUntil(thenable: Thenable<monaco.editor.IIdentifiedSingleEditOperation[]>): void;
}

@injectable()
export class TextModelResolverService implements ITextModelResolverService {

    protected readonly models = new Map<string, monaco.Promise<ReferenceAwareModel> | undefined>();
    protected readonly onDidSaveModelEmitter = new Emitter<monaco.editor.IModel>();
    protected readonly onWillSaveModelEmitter = new Emitter<WillSaveModelEvent>();

    constructor(@inject(FileSystem) protected readonly fileSystem: FileSystem) {
    }

    get onWillSaveModel(): Event<WillSaveModelEvent> {
        return this.onWillSaveModelEmitter.event;
    }

    protected fireWillSaveModel(model: monaco.editor.IModel, reason: TextDocumentSaveReason): Promise<void> {
        let doSave: () => void;
        const promise = new Promise<void>(resolve => doSave = resolve);
        this.onWillSaveModelEmitter.fire({
            model, reason,
            waitUntil: thenable =>
                thenable.then(operations =>
                    model.applyEdits(operations)
                ).then(doSave)
        });
        return promise;
    }

    get onDidSaveModel(): Event<monaco.editor.IModel> {
        return this.onDidSaveModelEmitter.event;
    }

    protected fireDidSaveModel(model: monaco.editor.IModel): void {
        this.onDidSaveModelEmitter.fire(model);
    }

    createModelReference(uri: Uri): monaco.Promise<IReference<ITextEditorModel>> {
        return this.getOrCreateModel(uri).then(model => model.newReference());
    }

    protected getOrCreateModel(uri: Uri): monaco.Promise<ReferenceAwareModel> {
        const key = uri.path;
        const model = this.models.get(key);
        if (model) {
            return model;
        }
        const newModel = this.createModel(uri);
        this.models.set(key, newModel);
        newModel.then(m => m.onDispose(() => this.models.delete(key)));
        return newModel;
    }

    protected createModel(uri: Uri): monaco.Promise<ReferenceAwareModel> {
        const encoding = document.characterSet;
        return monaco.Promise.wrap(this.fileSystem.resolveContent(uri.toString(), encoding).then(result => {
            const modelReference: ReferenceAwareModel = new ReferenceAwareModel(result.stat, result.content, (stat, content) => {
                const model = modelReference.textEditorModel;
                return this.fireWillSaveModel(model, TextDocumentSaveReason.AfterDelay).then(() => {
                    const result = this.fileSystem.setContent(stat, content, encoding)
                    result.then(() =>
                        this.fireDidSaveModel(model)
                    );
                    return result;
                });
            });
            return modelReference
        }));
    }

    registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
        return {
            dispose(): void {
                // no-op
            }
        }
    }
}

export class ReferenceAwareModel implements ITextEditorModel {
    protected referenceCount = 0;
    protected model: monaco.editor.IModel;
    protected _onDispose: monaco.Emitter<void>;

    constructor(protected stat: FileStat, content: string, protected saveHandler: (stat: FileStat, content: string) => Promise<FileStat>) {
        this.model = monaco.editor.createModel(content, undefined, monaco.Uri.parse(stat.uri));
        this._onDispose = new monaco.Emitter<void>();
        this.registerSaveHandler()
    }

    protected registerSaveHandler(): void {
        let toDisposeOnSave = new DisposableCollection();
        this.model.onDidChangeContent(event => {
            toDisposeOnSave.dispose();
            const handle = window.setTimeout(() => {
                this.saveHandler(this.stat, this.model.getValue()).then(
                    newStat => {
                        this.stat = newStat
                    }
                )
            }, 500);
            toDisposeOnSave.push(Disposable.create(() => window.clearTimeout(handle)));
        })
    }

    newReference(): IReference<ITextEditorModel> {
        const object = this;
        object.referenceCount++;
        return {
            object,
            dispose: () => {
                object.referenceCount--;
                if (object.referenceCount === 0) {
                    object.dispose();
                }
            }
        }
    }

    get onDispose(): monaco.IEvent<void> {
        return this._onDispose.event;
    }

    load(): monaco.Promise<ReferenceAwareModel> {
        return monaco.Promise.as(this);
    }

    get textEditorModel(): monaco.editor.IModel {
        return this.model;
    }

    dispose(): void {
        this.model.dispose();
        this._onDispose.fire();
    }
}
