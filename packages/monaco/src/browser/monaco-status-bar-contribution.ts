/********************************************************************************
 * Copyright (C) 2018 Ericsson
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

import { injectable, inject } from 'inversify';
import { DisposableCollection } from '@theia/core';
import { FrontendApplicationContribution, FrontendApplication, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { EditorCommands, EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';

@injectable()
export class MonacoStatusBarContribution implements FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();

    constructor(
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
