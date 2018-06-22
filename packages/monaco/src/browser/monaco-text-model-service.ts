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

import { inject, injectable } from 'inversify';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import URI from "@theia/core/lib/common/uri";
import { ResourceProvider, ReferenceCollection, Event } from "@theia/core";
import { EditorPreferences, EditorPreferenceChange } from '@theia/editor/lib/browser';
import { MonacoEditorModel } from "./monaco-editor-model";

@injectable()
export class MonacoTextModelService implements monaco.editor.ITextModelService {

    protected readonly _models = new ReferenceCollection<string, MonacoEditorModel>(
        uri => this.loadModel(new URI(uri))
    );

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    @inject(MonacoToProtocolConverter)
    protected readonly m2p: MonacoToProtocolConverter;

    @inject(ProtocolToMonacoConverter)
    protected readonly p2m: ProtocolToMonacoConverter;

    get models(): MonacoEditorModel[] {
        return this._models.values();
    }

    get(uri: string): MonacoEditorModel | undefined {
        return this._models.get(uri);
    }

    get onDidCreate(): Event<MonacoEditorModel> {
        return this._models.onDidCreate;
    }

    createModelReference(raw: monaco.Uri | URI): monaco.Promise<monaco.editor.IReference<MonacoEditorModel>> {
        return monaco.Promise.wrap(this._models.acquire(raw.toString()));
    }

    protected async loadModel(uri: URI): Promise<MonacoEditorModel> {
        await this.editorPreferences.ready;
        const resource = await this.resourceProvider(uri);
        const model = await (new MonacoEditorModel(resource, this.m2p, this.p2m).load());
        model.autoSave = this.editorPreferences["editor.autoSave"];
        model.autoSaveDelay = this.editorPreferences["editor.autoSaveDelay"];
        model.textEditorModel.updateOptions(this.getModelOptions());
        const disposable = this.editorPreferences.onPreferenceChanged(change => this.updateModel(model, change));
        model.onDispose(() => disposable.dispose());
        return model;
    }

    protected readonly modelOptions: {
        [name: string]: (keyof monaco.editor.ITextModelUpdateOptions | undefined)
    } = {
            'editor.tabSize': 'tabSize',
            'editor.insertSpaces': 'insertSpaces'
        };

    protected updateModel(model: MonacoEditorModel, change: EditorPreferenceChange): void {
        if (change.preferenceName === "editor.autoSave") {
            model.autoSave = this.editorPreferences["editor.autoSave"];
        }
        if (change.preferenceName === "editor.autoSaveDelay") {
            model.autoSaveDelay = this.editorPreferences["editor.autoSaveDelay"];
        }
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
            tabSize: this.editorPreferences['editor.tabSize'],
            insertSpaces: this.editorPreferences['editor.insertSpaces']
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
