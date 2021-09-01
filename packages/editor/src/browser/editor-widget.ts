/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { Disposable, SelectionService, Event } from '@theia/core/lib/common';
import { Widget, BaseWidget, Message, Saveable, SaveableSource, Navigatable, StatefulWidget } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { TextEditor } from './editor';

export class EditorWidget extends BaseWidget implements SaveableSource, Navigatable, StatefulWidget {

    constructor(
        readonly editor: TextEditor,
        protected readonly selectionService: SelectionService
    ) {
        super(editor);
        this.addClass('theia-editor');
        this.toDispose.push(this.editor);
        this.toDispose.push(this.editor.onSelectionChanged(() => this.setSelection()));
        this.toDispose.push(this.editor.onFocusChanged(() => this.setSelection()));
        this.toDispose.push(Disposable.create(() => {
            if (this.selectionService.selection === this.editor) {
                this.selectionService.selection = undefined;
            }
        }));
    }

    setSelection(): void {
        if (this.editor.isFocused() && this.selectionService.selection !== this.editor) {
            this.selectionService.selection = this.editor;
        }
    }

    get saveable(): Saveable {
        return this.editor.document;
    }

    getResourceUri(): URI | undefined {
        return this.editor.getResourceUri();
    }
    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.editor.createMoveToUri(resourceUri);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.editor.focus();
        this.selectionService.selection = this.editor;
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.isVisible) {
            this.editor.refresh();
        }
    }

    protected onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.editor.refresh();
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        if (msg.width < 0 || msg.height < 0) {
            this.editor.resizeToFit();
        } else {
            this.editor.setSize(msg);
        }
    }

    storeState(): object {
        return this.editor.storeViewState();
    }

    restoreState(oldState: object): void {
        this.editor.restoreViewState(oldState);
    }

    get onDispose(): Event<void> {
        return this.toDispose.onDispose;
    }

}
