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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { ResourceProvider, ReferenceCollection, Event, MaybePromise, Resource, ContributionProvider, OS } from '@theia/core';
import { EditorPreferences, EditorPreferenceChange } from '@theia/editor/lib/browser';
import { MonacoEditorModel } from './monaco-editor-model';
import { IDisposable, IReference } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { MonacoToProtocolConverter } from './monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from './protocol-to-monaco-converter';
import { ILogger } from '@theia/core/lib/common/logger';
import * as monaco from '@theia/monaco-editor-core';
import { ITextModelService, ITextModelContentProvider } from '@theia/monaco-editor-core/esm/vs/editor/common/services/resolverService';
import { ITextModelUpdateOptions } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ITextResourcePropertiesService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/textResourceConfiguration';

export const MonacoEditorModelFactory = Symbol('MonacoEditorModelFactory');
export interface MonacoEditorModelFactory {

    readonly scheme: string;

    createModel(
        resource: Resource
    ): MaybePromise<MonacoEditorModel>;

}

@injectable()
export class MonacoTextModelService implements ITextModelService {
    declare readonly _serviceBrand: undefined;

    /**
     * This component does some asynchronous work before being fully initialized.
     *
     * @deprecated since 1.25.0. Is instantly resolved.
     */
    readonly ready: Promise<void> = Promise.resolve();

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

    @inject(ContributionProvider)
    @named(MonacoEditorModelFactory)
    protected readonly factories: ContributionProvider<MonacoEditorModelFactory>;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileService)
    protected readonly fileService: FileService;

    @postConstruct()
    public init(): void {
        const resourcePropertiesService = StandaloneServices.get(ITextResourcePropertiesService);

        if (resourcePropertiesService) {
            resourcePropertiesService.getEOL = () => {
                const eol = this.editorPreferences['files.eol'];
                if (eol && eol !== 'auto') {
                    return eol;
                }
                return OS.backend.isWindows ? '\r\n' : '\n';
            };
        }
    }

    get models(): MonacoEditorModel[] {
        return this._models.values();
    }

    get(uri: string): MonacoEditorModel | undefined {
        return this._models.get(uri);
    }

    get onDidCreate(): Event<MonacoEditorModel> {
        return this._models.onDidCreate;
    }

    createModelReference(raw: monaco.Uri | URI): Promise<IReference<MonacoEditorModel>> {
        return this._models.acquire(raw.toString());
    }

    protected async loadModel(uri: URI): Promise<MonacoEditorModel> {
        await this.editorPreferences.ready;
        const resource = await this.resourceProvider(uri);
        const model = await (await this.createModel(resource)).load();
        this.updateModel(model);
        model.textEditorModel.onDidChangeLanguage(() => this.updateModel(model));
        const disposable = this.editorPreferences.onPreferenceChanged(change => this.updateModel(model, change));
        model.onDispose(() => disposable.dispose());
        return model;
    }

    protected createModel(resource: Resource): MaybePromise<MonacoEditorModel> {
        const factory = this.factories.getContributions().find(({ scheme }) => resource.uri.scheme === scheme);
        return factory ? factory.createModel(resource) : new MonacoEditorModel(resource, this.m2p, this.p2m, this.logger, this.editorPreferences);
    }

    protected readonly modelOptions: { [name: string]: (keyof ITextModelUpdateOptions | undefined) } = {
        'editor.tabSize': 'tabSize',
        'editor.insertSpaces': 'insertSpaces'
    };

    protected toModelOption(editorPreference: EditorPreferenceChange['preferenceName']): keyof ITextModelUpdateOptions | undefined {
        switch (editorPreference) {
            case 'editor.tabSize': return 'tabSize';
            case 'editor.insertSpaces': return 'insertSpaces';
            case 'editor.bracketPairColorization.enabled':
            case 'editor.bracketPairColorization.independentColorPoolPerBracketType':
                return 'bracketColorizationOptions';
            case 'editor.trimAutoWhitespace': return 'trimAutoWhitespace';

        }
        return undefined;
    }

    protected updateModel(model: MonacoEditorModel, change?: EditorPreferenceChange): void {
        if (!change) {
            model.autoSave = this.editorPreferences.get('files.autoSave', undefined, model.uri);
            model.autoSaveDelay = this.editorPreferences.get('files.autoSaveDelay', undefined, model.uri);
            model.textEditorModel.updateOptions(this.getModelOptions(model));
        } else if (change.affects(model.uri, model.languageId)) {
            if (change.preferenceName === 'files.autoSave') {
                model.autoSave = this.editorPreferences.get('files.autoSave', undefined, model.uri);
            }
            if (change.preferenceName === 'files.autoSaveDelay') {
                model.autoSaveDelay = this.editorPreferences.get('files.autoSaveDelay', undefined, model.uri);
            }
            const modelOption = this.toModelOption(change.preferenceName);
            if (modelOption) {
                model.textEditorModel.updateOptions(this.getModelOptions(model));
            }
        }
    }

    /** @deprecated pass MonacoEditorModel instead  */
    protected getModelOptions(uri: string): ITextModelUpdateOptions;
    protected getModelOptions(model: MonacoEditorModel): ITextModelUpdateOptions;
    protected getModelOptions(arg: string | MonacoEditorModel): ITextModelUpdateOptions {
        const uri = typeof arg === 'string' ? arg : arg.uri;
        const overrideIdentifier = typeof arg === 'string' ? undefined : arg.languageId;
        return {
            tabSize: this.editorPreferences.get({ preferenceName: 'editor.tabSize', overrideIdentifier }, undefined, uri),
            insertSpaces: this.editorPreferences.get({ preferenceName: 'editor.insertSpaces', overrideIdentifier }, undefined, uri),
            bracketColorizationOptions: {
                enabled: this.editorPreferences.get({ preferenceName: 'editor.bracketPairColorization.enabled', overrideIdentifier }, undefined, uri),
                independentColorPoolPerBracketType: this.editorPreferences.get(
                    { preferenceName: 'editor.bracketPairColorization.independentColorPoolPerBracketType', overrideIdentifier }, undefined, uri),
            },
            trimAutoWhitespace: this.editorPreferences.get({ preferenceName: 'editor.trimAutoWhitespace', overrideIdentifier }, undefined, uri),
        };
    }

    registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
        return {
            dispose(): void {
                // no-op
            }
        };
    }

    canHandleResource(resource: monaco.Uri): boolean {
        return this.fileService.canHandleResource(new URI(resource));
    }
}
