// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DiffUris } from '@theia/core/lib/browser';
import { EditorManager } from './editor-manager';

@injectable()
export class EditorContextKeys {

    /**
     * True when the editor's associated language ID matches.
     * Example: "editorLangId == typescript".
     */
    editorLangId: ContextKey<string>;

    /**
     * True if one editor is open.
     */
    editorIsOpen: ContextKey<boolean>;

    /**
     * At least one diff (compare) editor is visible.
     */
    textCompareEditorVisible: ContextKey<boolean>;

    @inject(ContextKeyService)
    protected contextKeyService: ContextKeyService;

    @inject(EditorManager)
    protected editorManager: EditorManager;

    @postConstruct()
    protected postConstruct(): void {
        this.editorLangId = this.contextKeyService.createKey('editorLangId', '');
        this.editorManager.onCurrentEditorChanged(widget => this.editorLangId.set(widget?.editor.document.languageId ?? ''));

        this.editorIsOpen = this.contextKeyService.createKey('editorIsOpen', false);
        const updateEditorIsOpen = () => this.editorIsOpen.set(!!this.editorManager.all.length);
        this.editorManager.onCreated(widget => {
            updateEditorIsOpen();
            widget.disposed.connect(updateEditorIsOpen);
        });

        this.textCompareEditorVisible = this.contextKeyService.createKey('textCompareEditorVisible', false);
        const updateTextCompareEditorVisible = () => {
            const textCompareEditorVisible = this.editorManager.all.some(widget => DiffUris.isDiffUri(widget.editor.uri) && widget.isVisible);
            this.textCompareEditorVisible.set(textCompareEditorVisible);
        };
        this.editorManager.onCreated(widget => {
            updateTextCompareEditorVisible();
            widget.disposed.connect(updateTextCompareEditorVisible);
        });
        this.editorManager.onCurrentEditorChanged(() => updateTextCompareEditorVisible());
    }

}
