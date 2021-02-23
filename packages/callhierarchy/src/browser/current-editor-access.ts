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

import { injectable, inject } from '@theia/core/shared/inversify';
import { EditorManager, TextEditor } from '@theia/editor/lib/browser';
import { Location } from '@theia/core/shared/vscode-languageserver-types';

@injectable()
export class CurrentEditorAccess {

    @inject(EditorManager) protected readonly editorManager: EditorManager;

    getSelection(): Location | undefined {
        const activeEditor = this.getCurrentEditor();
        if (!activeEditor) {
            return;
        }
        const range = activeEditor.selection;
        const uri = activeEditor.uri.toString();
        return <Location>{ range, uri };
    }

    getLanguageId(): string | undefined {
        const activeEditor = this.getCurrentEditor();
        if (!activeEditor) {
            return;
        }
        return activeEditor.document.languageId;
    }

    protected getCurrentEditor(): TextEditor | undefined {
        const activeEditor = this.editorManager.currentEditor;
        if (activeEditor) {
            return activeEditor.editor;
        }
        return undefined;
    }

}
