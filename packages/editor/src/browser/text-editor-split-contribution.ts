// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Widget, DockLayout } from '@theia/core/lib/browser';
import { SplitEditorContribution } from './split-editor-contribution';
import { EditorWidget } from './editor-widget';
import { EditorManager } from './editor-manager';

/**
 * Implementation of SplitEditorContribution for text editors (EditorWidget).
 */
@injectable()
export class TextEditorSplitContribution implements SplitEditorContribution<EditorWidget> {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    canHandle(widget: Widget): number {
        return widget instanceof EditorWidget ? 100 : 0;
    }

    async split(widget: EditorWidget, splitMode: DockLayout.InsertMode): Promise<EditorWidget | undefined> {
        const selection = widget.editor.selection;
        const newEditor = await this.editorManager.openToSide(widget.editor.uri, {
            selection,
            widgetOptions: { mode: splitMode, ref: widget }
        });

        // Preserve the view state (scroll position, etc.) from the original editor
        const oldEditorState = widget.editor.storeViewState();
        newEditor.editor.restoreViewState(oldEditorState);

        return newEditor;
    }
}

