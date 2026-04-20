// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import '../../../src/browser/style/multi-diff-editor.css';

import { Container, interfaces } from '@theia/core/shared/inversify';
import { nls, URI } from '@theia/core';
import { DiffUris, LabelProvider, NavigatableWidgetOptions, OpenHandler, WidgetFactory } from '@theia/core/lib/browser';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoDiffEditor } from '@theia/monaco/lib/browser/monaco-diff-editor';
import {
    DiffEntryHeaderWidget, MultiDiffEditor, MultiDiffEditorData, MultiDiffEditorOpenHandler, MultiDiffEditorUri
} from './multi-diff-editor';
import { MultiDiffEditorResourcePair, MultiDiffEditorUriData } from './multi-diff-editor-uri';

export function bindMultiDiffEditor(bind: interfaces.Bind): void {
    bind(MultiDiffEditorWidgetFactory).toDynamicValue(ctx => new MultiDiffEditorWidgetFactory(ctx.container));
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: MultiDiffEditorOpenHandler.ID,
        createWidget: (options: NavigatableWidgetOptions) => ctx.container.get(MultiDiffEditorWidgetFactory).createMultiDiffEditor(new URI(options.uri))
    })).inSingletonScope();

    bind(MultiDiffEditorOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(MultiDiffEditorOpenHandler);
}

/** Options applied to the embedded diff/code editors. */
const EMBEDDED_EDITOR_OPTIONS: monaco.editor.IEditorOptions = {
    folding: false,
    codeLens: false,
    stickyScroll: { enabled: false },
    minimap: { enabled: false }
};

class MultiDiffEditorWidgetFactory {

    constructor(
        protected readonly container: interfaces.Container,
        protected readonly editorManager = container.get(EditorManager),
        protected readonly labelProvider = container.get(LabelProvider),
    ) { }

    /**
     * Create the multi-diff editor shell synchronously with a placeholder per resource,
     * then load the embedded diff editors in parallel in the background. Each entry
     * transitions from a loading indicator to either the editor or an error message
     * as it resolves.
     */
    createMultiDiffEditor(uri: URI): MultiDiffEditor {
        const data = MultiDiffEditorUri.decode(uri);
        const editor = this.instantiateMultiDiffEditor(data);
        for (const resource of data.resources) {
            const headerWidget = new DiffEntryHeaderWidget(resource, this.labelProvider);
            editor.addDiffEntry(resource, headerWidget);
        }
        this.loadEntryEditors(editor, data.resources);
        return editor;
    }

    protected instantiateMultiDiffEditor(data: MultiDiffEditorUriData): MultiDiffEditor {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = this.container;
        child.bind(MultiDiffEditorData).toConstantValue(data);
        child.bind(MultiDiffEditor).toSelf();
        return child.get(MultiDiffEditor);
    }

    protected loadEntryEditors(editor: MultiDiffEditor, resources: readonly MultiDiffEditorResourcePair[]): void {
        resources.forEach((resource, index) => {
            const entry = editor.entries[index];
            this.createEmbeddedEditorWidget(resource).then(
                editorWidget => {
                    if (editor.isDisposed || entry.isDisposed) {
                        editorWidget.dispose();
                        return;
                    }
                    entry.setEditor(editorWidget);
                    editor.notifyTrackableWidgetsChanged();
                },
                error => {
                    console.error('Failed to load diff editor for', resource.modifiedUri.toString(), error);
                    if (!entry.isDisposed) {
                        const message = error instanceof Error ? error.message : String(error);
                        entry.setError(nls.localize('theia/scm/multiDiffEditor/loadFailed', 'Failed to load diff: {0}', message));
                    }
                }
            );
        });
    }

    protected async createEmbeddedEditorWidget(resource: MultiDiffEditorResourcePair): Promise<EditorWidget> {
        const diffUri = DiffUris.encode(resource.originalUri, resource.modifiedUri);
        const editorWidget = await this.editorManager.createByUri(diffUri);
        this.configureEmbeddedEditor(editorWidget);
        return editorWidget;
    }

    protected configureEmbeddedEditor(editorWidget: EditorWidget): void {
        const monacoEditor = MonacoEditor.get(editorWidget);
        if (monacoEditor instanceof MonacoDiffEditor) {
            monacoEditor.diffEditor.updateOptions(EMBEDDED_EDITOR_OPTIONS);
        } else if (monacoEditor) {
            monacoEditor.getControl().updateOptions(EMBEDDED_EDITOR_OPTIONS);
        }
    }
}
