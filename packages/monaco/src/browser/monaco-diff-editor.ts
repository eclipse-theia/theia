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

import URI from '@theia/core/lib/common/uri';
import { Disposable } from '@theia/core/lib/common';
import { Dimension, DiffNavigator, DeltaDecorationParams } from '@theia/editor/lib/browser';
import { MonacoEditorModel } from './monaco-editor-model';
import { MonacoEditor, MonacoEditorServices } from './monaco-editor';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';

import IStandaloneDiffEditor = monaco.editor.IStandaloneDiffEditor;
import IDiffEditorConstructionOptions = monaco.editor.IDiffEditorConstructionOptions;
import IDiffNavigatorOptions = monaco.editor.IDiffNavigatorOptions;
import IEditorOverrideServices = monaco.editor.IEditorOverrideServices;

export namespace MonacoDiffEditor {
    export interface IOptions extends MonacoEditor.ICommonOptions, IDiffEditorConstructionOptions, IDiffNavigatorOptions {
    }
}

export class MonacoDiffEditor extends MonacoEditor {
    protected _diffEditor: IStandaloneDiffEditor;
    protected _diffNavigator: DiffNavigator;

    constructor(
        readonly uri: URI,
        readonly node: HTMLElement,
        readonly originalModel: MonacoEditorModel,
        readonly modifiedModel: MonacoEditorModel,
        services: MonacoEditorServices,
        protected readonly diffNavigatorFactory: MonacoDiffNavigatorFactory,
        options?: MonacoDiffEditor.IOptions,
        override?: IEditorOverrideServices,
    ) {
        super(uri, modifiedModel, node, services, options, override);
        this.documents.add(originalModel);
        const original = originalModel.textEditorModel;
        const modified = modifiedModel.textEditorModel;
        this._diffNavigator = diffNavigatorFactory.createdDiffNavigator(this._diffEditor, options);
        this._diffEditor.setModel({ original, modified });
    }

    get diffEditor(): IStandaloneDiffEditor {
        return this._diffEditor;
    }

    get diffNavigator(): DiffNavigator {
        return this._diffNavigator;
    }

    protected create(options?: IDiffEditorConstructionOptions, override?: monaco.editor.IEditorOverrideServices): Disposable {
        this._diffEditor = monaco.editor.createDiffEditor(this.node, <IDiffEditorConstructionOptions>{
            ...options,
            fixedOverflowWidgets: true
        }, override);
        this.editor = this._diffEditor.getModifiedEditor();
        return this._diffEditor;
    }

    protected resize(dimension: Dimension | null): void {
        if (this.node) {
            const layoutSize = this.computeLayoutSize(this.node, dimension);
            this._diffEditor.layout(layoutSize);
        }
    }

    isActionSupported(id: string): boolean {
        const action = this._diffEditor.getSupportedActions().find(a => a.id === id);
        return !!action && action.isSupported() && super.isActionSupported(id);
    }

    deltaDecorations(params: DeltaDecorationParams): string[] {
        console.warn('`deltaDecorations` should be called on either the original, or the modified editor.');
        return [];
    }

    getResourceUri(): URI {
        return new URI(this.originalModel.uri);
    }
    createMoveToUri(resourceUri: URI): URI {
        const [left, right] = DiffUris.decode(this.uri);
        return DiffUris.encode(left.withPath(resourceUri.path), right.withPath(resourceUri.path));
    }

}
