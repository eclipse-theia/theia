/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { DisposableCollection, Disposable, UriHandlerRegistry } from "../../application/common";
import { MonacoEditorModel } from "./monaco-editor-model";
import ITextModelResolverService = monaco.editor.ITextModelResolverService;
import ITextModelContentProvider = monaco.editor.ITextModelContentProvider;
import ITextEditorModel = monaco.editor.ITextEditorModel;
import IReference = monaco.editor.IReference;
import IDisposable = monaco.IDisposable;
import Uri = monaco.Uri;

@injectable()
export class MonacoModelResolver implements ITextModelResolverService {

    protected readonly models = new Map<string, monaco.Promise<MonacoEditorModel>>();
    protected readonly references = new Map<ITextEditorModel, DisposableCollection>();

    constructor( @inject(UriHandlerRegistry) protected readonly uriHandlerRegistry: UriHandlerRegistry) {
    }

    createModelReference(uri: Uri): monaco.Promise<IReference<MonacoEditorModel>> {
        return this.getOrCreateModel(uri).then(model =>
            this.newReference(model)
        );
    }

    protected newReference(model: MonacoEditorModel): IReference<MonacoEditorModel> {
        let references = this.references.get(model);
        if (references === undefined) {
            references = new DisposableCollection();
            references.onDispose(() => model.dispose());
            model.onDispose(() => {
                this.references.delete(model);
                references!.dispose();
            });
            this.references.set(model, references);
        }

        let removeReference: Disposable;
        const reference: IReference<MonacoEditorModel> = {
            object: model,
            dispose: () =>
                removeReference.dispose()
        }
        removeReference = references.push(reference);
        return reference;
    }

    protected getOrCreateModel(uri: Uri): monaco.Promise<MonacoEditorModel> {
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

    protected createModel(uri: Uri): monaco.Promise<MonacoEditorModel> {
        return new monaco.Promise(resolve =>
            this.uriHandlerRegistry.get(uri.toString()).then(uriHandler => {
                if (uriHandler) {
                    const model = new MonacoEditorModel(uriHandler);
                    resolve(model.load());
                }
            })
        );
    }

    registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
        return {
            dispose(): void {
                // no-op
            }
        }
    }
}
