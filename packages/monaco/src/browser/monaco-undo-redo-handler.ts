// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { UndoRedoHandler } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import { ICodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorBrowser';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';

@injectable()
export abstract class AbstractMonacoUndoRedoHandler implements UndoRedoHandler<ICodeEditor> {
    priority: number;
    abstract select(): ICodeEditor | undefined;
    undo(item: ICodeEditor): void {
        item.trigger('MonacoUndoRedoHandler', 'undo', undefined);
    }
    redo(item: ICodeEditor): void {
        item.trigger('MonacoUndoRedoHandler', 'redo', undefined);
    }
}

@injectable()
export class FocusedMonacoUndoRedoHandler extends AbstractMonacoUndoRedoHandler {
    override priority = 10000;

    protected codeEditorService = StandaloneServices.get(ICodeEditorService);

    override select(): ICodeEditor | undefined {
        const focusedEditor = this.codeEditorService.getFocusedCodeEditor();
        if (focusedEditor && focusedEditor.hasTextFocus()) {
            return focusedEditor;
        }
        return undefined;
    }
}

@injectable()
export class ActiveMonacoUndoRedoHandler extends AbstractMonacoUndoRedoHandler {
    override priority = 0;

    protected codeEditorService = StandaloneServices.get(ICodeEditorService);

    override select(): ICodeEditor | undefined {
        const focusedEditor = this.codeEditorService.getActiveCodeEditor();
        if (focusedEditor) {
            focusedEditor.focus();
            return focusedEditor;
        }
        return undefined;
    }
}
