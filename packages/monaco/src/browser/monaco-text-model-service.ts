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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { ResourceProvider, ReferenceCollection, Event, MaybePromise, Resource, ContributionProvider, OS, Emitter } from '@theia/core';
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

export const MonacoEditorModelFilter = Symbol('MonacoEditorModelFilter');
/**
 * A filter that prevents firing the `onDidCreate` event for certain models.
 * Preventing this event from firing will also prevent the propagation of the model to the plugin host.
 *
 * This is useful for models that are not supposed to be opened in a dedicated monaco editor widgets.
 * This includes models for notebook cells.
 */
export interface MonacoEditorModelFilter {
    /**
     * Return `true` on models that should be filtered.
     */
    filter(model: MonacoEditorModel): boolean;
}

@injectable()
export class MonacoTextModelService implements ITextModelService {
    declare readonly _serviceBrand: undefined;

    protected readonly _models = new ReferenceCollection<string, MonacoEditorModel>(
        uri => this.loadModel(new URI(uri))
    );

    protected readonly _visibleModels = new Set<MonacoEditorModel>();

    protected readonly onDidCreateEmitter = new Emitter<MonacoEditorModel>();

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

    @inject(ContributionProvider)
    @named(MonacoEditorModelFilter)
    protected readonly filters: ContributionProvider<MonacoEditorModelFilter>;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(FileService)
    protected readonly fileService: FileService;

    @postConstruct()
    protected init(): void {
        const resourcePropertiesService = StandaloneServices.get(ITextResourcePropertiesService);

        if (resourcePropertiesService) {
            resourcePropertiesService.getEOL = () => {
                const eol = this.editorPreferences['files.eol'];
                if (eol && eol !== 'auto') {
                    return eol;
                }
                return OS.backend.EOL;
            };
        }
        this._models.onDidCreate(model => {
            const filters = this.filters.getContributions();
            if (filters.some(filter => filter.filter(model))) {
                return;
            }
            this._visibleModels.add(model);
            const dispose = model.onWillDispose(() => {
                this._visibleModels.delete(model);
                dispose.dispose();
            });
            this.onDidCreateEmitter.fire(model);
        });
    }

    get models(): MonacoEditorModel[] {
        return Array.from(this._visibleModels);
    }

    get(uri: string): MonacoEditorModel | undefined {
        return this._models.get(uri);
    }

    get onDidCreate(): Event<MonacoEditorModel> {
        return this.onDidCreateEmitter.event;
    }

    createModelReference(raw: monaco.Uri | URI): Promise<IReference<MonacoEditorModel>> {
        return this._models.acquire(raw.toString());
    }

    async loadModel(uri: URI): Promise<MonacoEditorModel> {
        await this.editorPreferences.ready;
        const resource = await this.resourceProvider(uri);
        const model = await (await this.createModel(resource)).load();
        return model;
    }

    protected createModel(resource: Resource): MaybePromise<MonacoEditorModel> {
        const factory = this.factories.getContributions().find(({ scheme }) => resource.uri.scheme === scheme);
        return factory ? factory.createModel(resource) : new MonacoEditorModel(resource, this.m2p, this.p2m, this.logger, this.editorPreferences);
    }

    protected readonly modelOptions: { [name: string]: (keyof ITextModelUpdateOptions | undefined) } = {
        'editor.tabSize': 'tabSize',
        'editor.insertSpaces': 'insertSpaces',
        'editor.indentSize': 'indentSize'
    };

    protected toModelOption(editorPreference: EditorPreferenceChange['preferenceName']): keyof ITextModelUpdateOptions | undefined {
        switch (editorPreference) {
            case 'editor.tabSize': return 'tabSize';
            case 'editor.indentSize': return 'indentSize';
            case 'editor.insertSpaces': return 'insertSpaces';
            case 'editor.bracketPairColorization.enabled':
            case 'editor.bracketPairColorization.independentColorPoolPerBracketType':
                return 'bracketColorizationOptions';
            case 'editor.trimAutoWhitespace': return 'trimAutoWhitespace';

        }
        return undefined;
    }

    registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
        return {
            dispose(): void {
                // no-op
            }
        };
    }

    canHandleResource(resource: monaco.Uri): boolean {
        return this.fileService.canHandleResource(URI.fromComponents(resource));
    }
}
