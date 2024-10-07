// *****************************************************************************
// Copyright (C) 2018 Ericsson
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

import { injectable } from '@theia/core/shared/inversify';
import { DisposableCollection, nls } from '@theia/core';
import { StatusBar, StatusBarAlignment, Widget, WidgetStatusBarContribution } from '@theia/core/lib/browser';
import { EditorCommands, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';
import * as monaco from '@theia/monaco-editor-core';

export const EDITOR_STATUS_TABBING_CONFIG = 'editor-status-tabbing-config';
export const EDITOR_STATUS_EOL = 'editor-status-eol';

@injectable()
export class MonacoStatusBarContribution implements WidgetStatusBarContribution<EditorWidget> {

    protected readonly toDispose = new DisposableCollection();

    canHandle(widget: Widget): widget is EditorWidget {
        if (widget instanceof EditorWidget) {
            return Boolean(this.getModel(widget));
        }
        return false;
    }

    activate(statusBar: StatusBar, editor: EditorWidget): void {
        this.toDispose.dispose();
        const editorModel = this.getModel(editor);
        if (editorModel) {
            this.setConfigTabSizeWidget(statusBar, editorModel);
            this.setLineEndingWidget(statusBar, editorModel);
            this.toDispose.push(editorModel.onDidChangeOptions(() => {
                this.setConfigTabSizeWidget(statusBar, editorModel);
                this.setLineEndingWidget(statusBar, editorModel);
            }));
            let previous = editorModel.getEOL();
            this.toDispose.push(editorModel.onDidChangeContent(e => {
                if (previous !== e.eol) {
                    previous = e.eol;
                    this.setLineEndingWidget(statusBar, editorModel);
                }
            }));
        } else {
            this.deactivate(statusBar);
        }
    }

    deactivate(statusBar: StatusBar): void {
        this.toDispose.dispose();
        this.removeConfigTabSizeWidget(statusBar);
        this.removeLineEndingWidget(statusBar);
    }

    protected setConfigTabSizeWidget(statusBar: StatusBar, model: monaco.editor.ITextModel): void {
        const modelOptions = model.getOptions();
        const tabSize = modelOptions.tabSize;
        const indentSize = modelOptions.indentSize;
        const spaceOrTabSizeMessage = modelOptions.insertSpaces
            ? nls.localizeByDefault('Spaces: {0}', indentSize)
            : nls.localizeByDefault('Tab Size: {0}', tabSize);
        statusBar.setElement(EDITOR_STATUS_TABBING_CONFIG, {
            text: spaceOrTabSizeMessage,
            alignment: StatusBarAlignment.RIGHT,
            priority: 10,
            command: EditorCommands.CONFIG_INDENTATION.id,
            tooltip: nls.localizeByDefault('Select Indentation')
        });
    }

    protected removeConfigTabSizeWidget(statusBar: StatusBar): void {
        statusBar.removeElement(EDITOR_STATUS_TABBING_CONFIG);
    }

    protected setLineEndingWidget(statusBar: StatusBar, model: monaco.editor.ITextModel): void {
        const eol = model.getEOL();
        const text = eol === '\n' ? 'LF' : 'CRLF';
        statusBar.setElement(EDITOR_STATUS_EOL, {
            text: `${text}`,
            alignment: StatusBarAlignment.RIGHT,
            priority: 11,
            command: EditorCommands.CONFIG_EOL.id,
            tooltip: nls.localizeByDefault('Select End of Line Sequence')
        });
    }

    protected removeLineEndingWidget(statusBar: StatusBar): void {
        statusBar.removeElement(EDITOR_STATUS_EOL);
    }

    protected getModel(editor: EditorWidget | undefined): monaco.editor.ITextModel | undefined {
        const monacoEditor = MonacoEditor.get(editor);
        return monacoEditor && monacoEditor.getControl().getModel() || undefined;
    }
}
