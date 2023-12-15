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

import URI from '@theia/core/lib/common/uri';
import { Disposable } from '@theia/core/lib/common';
import { Dimension, DiffNavigator, DeltaDecorationParams } from '@theia/editor/lib/browser';
import { MonacoEditorModel } from './monaco-editor-model';
import { EditorServiceOverrides, MonacoEditor, MonacoEditorServices } from './monaco-editor';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import * as monaco from '@theia/monaco-editor-core';
import { IDiffEditorConstructionOptions } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorBrowser';
import { StandaloneDiffEditor2 } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneCodeEditor';

export namespace MonacoDiffEditor {
    export interface IOptions extends MonacoEditor.ICommonOptions, IDiffEditorConstructionOptions {
    }
}

export class MonacoDiffEditor extends MonacoEditor {
    protected _diffEditor: StandaloneDiffEditor2;
    protected _diffNavigator: DiffNavigator;

    constructor(
        uri: URI,
        node: HTMLElement,
        readonly originalModel: MonacoEditorModel,
        readonly modifiedModel: MonacoEditorModel,
        services: MonacoEditorServices,
        protected readonly diffNavigatorFactory: MonacoDiffNavigatorFactory,
        options?: MonacoDiffEditor.IOptions,
        override?: EditorServiceOverrides
    ) {
        super(uri, modifiedModel, node, services, options, override);
        this.documents.add(originalModel);
        const original = originalModel.textEditorModel;
        const modified = modifiedModel.textEditorModel;
        this._diffNavigator = diffNavigatorFactory.createdDiffNavigator(this._diffEditor);
        this._diffEditor.setModel({ original, modified });
    }

    get diffEditor(): monaco.editor.IStandaloneDiffEditor {
        return this._diffEditor as unknown as monaco.editor.IStandaloneDiffEditor;
    }

    get diffNavigator(): DiffNavigator {
        return this._diffNavigator;
    }

    protected override create(options?: IDiffEditorConstructionOptions, override?: EditorServiceOverrides): Disposable {
        const instantiator = this.getInstantiatorWithOverrides(override);
        /**
         *  @monaco-uplift. Should be guaranteed to work.
         *  Incomparable enums prevent TypeScript from believing that public IStandaloneDiffEditor is satisfied by private StandaloneDiffEditor
         */
        this._diffEditor = instantiator
            .createInstance(StandaloneDiffEditor2, this.node, { ...options, fixedOverflowWidgets: true });
        this.editor = this._diffEditor.getModifiedEditor() as unknown as monaco.editor.IStandaloneCodeEditor;
        return this._diffEditor;
    }

    protected override resize(dimension: Dimension | null): void {
        if (this.node) {
            const layoutSize = this.computeLayoutSize(this.node, dimension);
            this._diffEditor.layout(layoutSize);
        }
    }

    override isActionSupported(id: string): boolean {
        const action = this._diffEditor.getSupportedActions().find(a => a.id === id);
        return !!action && action.isSupported() && super.isActionSupported(id);
    }

    override deltaDecorations(params: DeltaDecorationParams): string[] {
        console.warn('`deltaDecorations` should be called on either the original, or the modified editor.');
        return [];
    }

    override getResourceUri(): URI {
        return new URI(this.originalModel.uri);
    }
    override createMoveToUri(resourceUri: URI): URI {
        const [left, right] = DiffUris.decode(this.uri);
        return DiffUris.encode(left.withPath(resourceUri.path), right.withPath(resourceUri.path));
    }

}
