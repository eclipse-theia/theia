/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { KeybindingContext } from "@theia/core/lib/browser/keybinding";
import { EditorManager } from "./editor-manager";
import { EditorWidget } from "./editor-widget";

export namespace EditorKeybindingContexts {
    export const editorTextFocus = 'editorTextFocus';
}

@injectable()
export class EditorTextFocusContext implements KeybindingContext {

    readonly id: string = EditorKeybindingContexts.editorTextFocus;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    isEnabled(): boolean {
        return !!this.getEditor();
    }

    protected getEditor(): EditorWidget | undefined {
        const widget = this.editorManager.activeEditor;
        if (widget && this.canHandle(widget)) {
            return widget;
        }
        return undefined;
    }

    protected canHandle(widget: EditorWidget): boolean {
        return widget.editor.isFocused();
    }

}
