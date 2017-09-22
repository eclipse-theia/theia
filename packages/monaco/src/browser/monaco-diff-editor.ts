/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { MonacoWorkspace } from './monaco-workspace';
import { MonacoEditor } from './monaco-editor';
import { DisposableCollection } from '@theia/core/lib/common';
import {
    Dimension
} from '@theia/editor/lib/browser';

import IStandaloneDiffEditor = monaco.editor.IStandaloneDiffEditor;
import IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import IDiffEditorConstructionOptions = monaco.editor.IDiffEditorConstructionOptions;
import IEditorOverrideServices = monaco.editor.IEditorOverrideServices;
import IDiffEditorModel = monaco.editor.IDiffEditorModel;
import URI from '@theia/core/lib/common/uri';

export namespace MonacoDiffEditor {
    export interface IOptions extends MonacoEditor.ICommonOptions, IDiffEditorConstructionOptions { }
}

export class MonacoDiffEditor extends MonacoEditor {
    protected diffEditor: IStandaloneDiffEditor;

    constructor(
        readonly node: HTMLElement,
        protected readonly m2p: MonacoToProtocolConverter,
        protected readonly p2m: ProtocolToMonacoConverter,
        protected readonly workspace: MonacoWorkspace,
        protected readonly model: IDiffEditorModel,
        options?: MonacoDiffEditor.IOptions,
        override?: IEditorOverrideServices,
    ) {
        super(new URI(''), node, m2p, p2m, workspace, options, override);
        this.diffEditor.setModel({ original: model.original, modified: model.modified });
        // this.addHandlers(this.diffEditor.getOriginalEditor());
    }

    protected create(options: MonacoDiffEditor.IOptions | undefined, override?: monaco.editor.IEditorOverrideServices) {
        this.diffEditor = monaco.editor.createDiffEditor(this.node, {
            ...options,
            fixedOverflowWidgets: true
        });
        this.toDispose.push(this.diffEditor);

        this.editor = this.diffEditor.getModifiedEditor();
    }

    protected addOnDidFocusHandler(codeEditor: IStandaloneCodeEditor) {
        // increase the z-index for the focussed element hierarchy within the dockpanel
        this.toDispose.push(codeEditor.onDidFocusEditor(() => {
            const z = '1';
            // already increased? -> do nothing
            if (this.diffEditor.getDomNode().style.zIndex === z) {
                return;
            }
            const toDisposeOnBlur = new DisposableCollection();
            this.editor = codeEditor;
            this.increaseZIndex(this.diffEditor.getDomNode(), z, toDisposeOnBlur);
            toDisposeOnBlur.push(codeEditor.onDidBlurEditor(() =>
                toDisposeOnBlur.dispose()
            ));
        }));
    }

    protected isDiffEditor(e: IStandaloneDiffEditor | IStandaloneCodeEditor): e is IStandaloneDiffEditor {
        return 'getOriginalEditor' in e && 'getModifiedEditor' in e;
    }

    protected resize(dimension: Dimension | null): void {
        if (this.node) {
            const layoutSize = this.computeLayoutSize(this.node, dimension);
            this.diffEditor.layout(layoutSize);
        }
    }

    isActionSupported(id: string): boolean {
        const action = this.diffEditor.getActions().find(a => a.id === id);
        return !!action && action.isSupported() && super.isActionSupported(id);
    }
}
