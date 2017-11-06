/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import URI from "@theia/core/lib/common/uri";
import { DisposableCollection, Disposable, ResourceProvider } from "@theia/core/lib/common";
import { EditorPreferences, EditorPreferenceChange } from '@theia/editor/lib/browser';
import { MonacoEditorModel } from "./monaco-editor-model";

@injectable()
export class MonacoTextModelService implements monaco.editor.ITextModelService {

    protected readonly models = new Map<string, monaco.Promise<MonacoEditorModel>>();
    protected readonly references = new Map<monaco.editor.ITextEditorModel, DisposableCollection>();

    constructor(
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences
    ) { }

    createModelReference(raw: monaco.Uri | URI): monaco.Promise<monaco.editor.IReference<MonacoEditorModel>> {
        const uri = raw instanceof URI ? raw : new URI(raw.toString());
        return this.getOrCreateModel(uri).then(model =>
            this.newReference(model)
        );
    }

    protected newReference(model: MonacoEditorModel): monaco.editor.IReference<MonacoEditorModel> {
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
        const reference: monaco.editor.IReference<MonacoEditorModel> = {
            object: model,
            dispose: () =>
                removeReference.dispose()
        };
        removeReference = references.push(reference);
        return reference;
    }

    protected getOrCreateModel(uri: URI): monaco.Promise<MonacoEditorModel> {
        const key = uri.toString();
        const model = this.models.get(key);
        if (model) {
            return model;
        }
        const newModel = this.createModel(uri);
        this.models.set(key, newModel);
        newModel.then(m => m.onDispose(() => this.models.delete(key)));
        return newModel;
    }

    protected createModel(uri: URI): monaco.Promise<MonacoEditorModel> {
        return monaco.Promise.wrap(this.loadModel(uri));
    }

    protected async loadModel(uri: URI): Promise<MonacoEditorModel> {
        await this.editorPreferences.ready;
        const resource = await this.resourceProvider(uri);
        const model = await (new MonacoEditorModel(resource).load());
        model.textEditorModel.updateOptions(this.getModelOptions());
        const disposable = this.editorPreferences.onPreferenceChanged(change => this.updateModel(model, change));
        model.onDispose(() => disposable.dispose());
        return model;
    }

    protected readonly modelOptions: {
        [name: string]: (keyof monaco.editor.ITextModelUpdateOptions | undefined)
    } = {
        'editor.tabSize': 'tabSize'
    };

    protected updateModel(model: MonacoEditorModel, change: EditorPreferenceChange): void {
        const modelOption = this.modelOptions[change.preferenceName];
        if (modelOption) {
            const options: monaco.editor.ITextModelUpdateOptions = {};
            // tslint:disable-next-line:no-any
            options[modelOption] = change.newValue as any;
            model.textEditorModel.updateOptions(options);
        }
    }

    protected getModelOptions(): monaco.editor.ITextModelUpdateOptions {
        return {
            tabSize: this.editorPreferences["editor.tabSize"]
        };
    }

    registerTextModelContentProvider(scheme: string, provider: monaco.editor.ITextModelContentProvider): monaco.IDisposable {
        return {
            dispose(): void {
                // no-op
            }
        };
    }
}
