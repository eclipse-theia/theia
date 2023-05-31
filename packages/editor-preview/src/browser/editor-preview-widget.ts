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

import { TabBar, Widget, PINNED_CLASS } from '@theia/core/lib/browser';
import { EditorWidget, TextEditor } from '@theia/editor/lib/browser';
import { Disposable, DisposableCollection, Emitter, SelectionService, UNTITLED_SCHEME } from '@theia/core/lib/common';

const PREVIEW_TITLE_CLASS = 'theia-editor-preview-title-unpinned';
export class EditorPreviewWidget extends EditorWidget {
    protected _isPreview = false;

    protected readonly onDidChangePreviewStateEmitter = new Emitter<void>();
    readonly onDidChangePreviewState = this.onDidChangePreviewStateEmitter.event;

    get isPreview(): boolean {
        return this._isPreview;
    }

    constructor(
        editor: TextEditor,
        selectionService: SelectionService
    ) {
        super(editor, selectionService);
        this.toDispose.push(this.onDidChangePreviewStateEmitter);
    }

    initializePreview(): void {
        const oneTimeListeners = new DisposableCollection();
        this._isPreview = true;
        this.title.className += ` ${PREVIEW_TITLE_CLASS}`;
        const oneTimeDirtyChangeListener = this.saveable.onDirtyChanged(() => {
            this.convertToNonPreview();
            oneTimeListeners.dispose();
        });
        oneTimeListeners.push(oneTimeDirtyChangeListener);
        const oneTimeTitleChangeHandler = () => {
            if (this.title.className.includes(PINNED_CLASS)) {
                this.convertToNonPreview();
                oneTimeListeners.dispose();
            }
        };
        this.title.changed.connect(oneTimeTitleChangeHandler);
        oneTimeListeners.push(Disposable.create(() => this.title.changed.disconnect(oneTimeTitleChangeHandler)));
        this.toDispose.push(oneTimeListeners);
    }

    convertToNonPreview(): void {
        if (this._isPreview) {
            this._isPreview = false;
            this.currentTabbar = undefined;
            this.title.className = this.title.className.replace(PREVIEW_TITLE_CLASS, '');
            this.onDidChangePreviewStateEmitter.fire();
            this.onDidChangePreviewStateEmitter.dispose();
        }
    }

    protected override handleTabBarChange(oldTabBar?: TabBar<Widget> | undefined, newTabBar?: TabBar<Widget> | undefined): void {
        super.handleTabBarChange(oldTabBar, newTabBar);
        if (this._isPreview) {
            if (oldTabBar && newTabBar) { this.convertToNonPreview(); }
        }
    }

    override storeState(): { isPreview: boolean, editorState: object } | undefined {
        if (this.getResourceUri()?.scheme !== UNTITLED_SCHEME) {
            const { _isPreview: isPreview } = this;
            return { isPreview, editorState: this.editor.storeViewState() };
        }
    }

    override restoreState(oldState: { isPreview: boolean, editorState: object }): void {
        if (!oldState.isPreview) {
            this.convertToNonPreview();
        }
        this.editor.restoreViewState(oldState.editorState);
    }
}
