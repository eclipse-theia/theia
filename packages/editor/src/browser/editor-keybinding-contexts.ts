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

    /**
     * ID of a keybinding context that is enabled when the active text editor has the focus.
     */
    export const editorTextFocus = 'editorTextFocus';

    /**
     * Unique identifier of a keybinding context that is enabled if the active editor has the focus but it does not have any overlaying widgets, such as the content assist widget.
     */
    export const strictEditorTextFocus = 'strictEditorTextFocus';
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

/**
 * Keybinding context that is enabled when the active text editor has the focus **AND** it does not
 * have any widgets (for example, the content assist widget) overlaying the active editor.
 */
@injectable()
export class StrictEditorTextFocusContext extends EditorTextFocusContext {

    readonly id: string = EditorKeybindingContexts.strictEditorTextFocus;

}
