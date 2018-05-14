/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { SelectionService } from '@theia/core/lib/common';
import { Widget, BaseWidget, Message, Saveable, SaveableSource, Navigatable } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { TextEditor } from "./editor";

export class EditorWidget extends BaseWidget implements SaveableSource, Navigatable {

    constructor(
        readonly editor: TextEditor,
        protected readonly selectionService: SelectionService
    ) {
        super(editor);
        this.toDispose.push(this.editor);
        this.toDispose.push(this.editor.onSelectionChanged(() => {
            if (this.editor.isFocused()) {
                this.selectionService.selection = this.editor;
            }
        }));
    }

    get saveable(): Saveable {
        return this.editor.document;
    }

    getTargetUri(): URI | undefined {
        return this.editor.getTargetUri();
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

}
