/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Widget } from "@phosphor/widgets";
import { Message } from "@phosphor/messaging";
import { DisposableCollection, SelectionService } from "../../application/common";
import { TextEditor } from "./editor";

export class EditorWidget extends Widget {

    readonly editor: TextEditor;

    protected readonly toDispose = new DisposableCollection();

    constructor(
        editor: TextEditor,
        selectionService?: SelectionService
    ) {
        super(editor);
        this.toDispose.push(this.editor);
        if (selectionService) {
            this.toDispose.push(this.editor.onSelectionChanged(selection =>
                selectionService.selection = selection
            ));
        }
    }

    dispose() {
        super.dispose();
        this.toDispose.dispose();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg)
        this.editor.focus();
    }

    protected onCloseRequest(msg: Message): void {
        super.onCloseRequest(msg);
        this.dispose();
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.isVisible) {
            this.editor.refresh()
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
