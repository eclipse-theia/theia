// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { TabBar, Widget } from '@theia/core/lib/browser';
import { EditorWidget, TextEditor } from '@theia/editor/lib/browser';
import { Event, SelectionService, UNTITLED_SCHEME } from '@theia/core/lib/common';
import { PreviewTabWidget, PreviewTabSupport } from './preview-tab-widget';

export class EditorPreviewWidget extends EditorWidget implements PreviewTabWidget {

    protected readonly previewSupport: PreviewTabSupport;

    get isPreview(): boolean {
        return this.previewSupport.isPreview;
    }

    get onDidChangePreviewState(): Event<void> {
        return this.previewSupport.onDidChangePreviewState;
    }

    constructor(
        editor: TextEditor,
        selectionService: SelectionService
    ) {
        super(editor, selectionService);
        this.previewSupport = new PreviewTabSupport({
            title: this.title,
            saveable: this.saveable,
            toDispose: this.toDispose,
            onConvertToNonPreview: () => this.tabBarTracker.reset()
        });
    }

    initializePreview(): void {
        this.previewSupport.initializePreview();
    }

    convertToNonPreview(): void {
        this.previewSupport.convertToNonPreview();
    }

    protected override handleTabBarChange(oldTabBar?: TabBar<Widget> | undefined, newTabBar?: TabBar<Widget> | undefined): void {
        super.handleTabBarChange(oldTabBar, newTabBar);
        this.previewSupport.handleTabBarChange(oldTabBar, newTabBar);
    }

    override storeState(): { isPreview: boolean, editorState: object } | undefined {
        if (this.getResourceUri()?.scheme !== UNTITLED_SCHEME) {
            return { isPreview: this.isPreview, editorState: this.editor.storeViewState() };
        }
    }

    override restoreState(oldState: { isPreview: boolean, editorState: object }): void {
        if (!oldState.isPreview) {
            this.convertToNonPreview();
        }
        this.editor.restoreViewState(oldState.editorState);
    }
}
