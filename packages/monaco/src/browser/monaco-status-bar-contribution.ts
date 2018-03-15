/*
 * Copyright (C) 2018 Ericsson
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { DisposableCollection } from '@theia/core';
import { FrontendApplicationContribution, FrontendApplication, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { EditorCommands, EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { OutlineViewService } from '@theia/outline-view/lib/browser/outline-view-service';
import { MonacoEditor } from './monaco-editor';

@injectable()
export class MonacoStatusBarContribution implements FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();

    constructor(
        @inject(OutlineViewService) protected readonly outlineViewService: OutlineViewService,
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(StatusBar) protected readonly statusBar: StatusBar
    ) { }

    onStart(app: FrontendApplication): void {
        this.updateStatusBar();
        this.editorManager.onCurrentEditorChanged(() => this.updateStatusBar());
    }

    protected updateStatusBar(): void {
        const editor = this.editorManager.currentEditor;
        const editorModel = this.getModel(editor);
        if (editor && editorModel) {
            this.setConfigTabSizeWidget();

            this.toDispose.dispose();
            this.toDispose.push(editorModel.onDidChangeOptions(() => {
                this.setConfigTabSizeWidget();
            }));
        } else {
            this.removeConfigTabSizeWidget();
        }
    }

    protected setConfigTabSizeWidget() {
        const editor = this.editorManager.currentEditor;
        const editorModel = this.getModel(editor);
        if (editor && editorModel) {
            const modelOptions = editorModel.getOptions();
            const tabSize = modelOptions.tabSize;
            const useSpaceOrTab = modelOptions.insertSpaces ? 'Spaces' : 'Tab Size';
            this.statusBar.setElement('editor-status-tabbing-config', {
                text: `${useSpaceOrTab}: ${tabSize}`,
                alignment: StatusBarAlignment.RIGHT,
                priority: 10,
                command: EditorCommands.CONFIG_INDENTATION.id
            });
        }
    }
    protected removeConfigTabSizeWidget() {
        this.statusBar.removeElement('editor-status-tabbing-config');
    }

    protected getModel(editor: EditorWidget | undefined): monaco.editor.IModel | undefined {
        const monacoEditor = MonacoEditor.get(editor);
        return monacoEditor && monacoEditor.getControl().getModel();
    }
}
