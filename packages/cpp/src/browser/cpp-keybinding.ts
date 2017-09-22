/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { EditorManager } from "@theia/editor/lib/browser"
import {
    KeybindingContext, Keybinding, KeybindingContribution, KeybindingRegistry, KeyCode, Key, Modifier
} from "@theia/core/lib/common";

@injectable()
export class CppKeybindingContext implements KeybindingContext {
    constructor( @inject(EditorManager) protected readonly editorService: EditorManager) { }

    id = 'cpp.keybinding.context';

    isEnabled(arg?: Keybinding) {
        return this.editorService && !!this.editorService.activeEditor &&
            (this.editorService.activeEditor.editor.document.uri.endsWith(".cpp") || this.editorService.activeEditor.editor.document.uri.endsWith(".h"));
    }

}

@injectable()
export class CppKeybindingContribution implements KeybindingContribution {

    constructor(
        @inject(CppKeybindingContext) protected readonly cppKeybindingContext: CppKeybindingContext
    ) { }

    registerDefaultKeyBindings(registry: KeybindingRegistry): void {
        [
            {
                commandId: 'switch_source_header',
                context: this.cppKeybindingContext,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_O, modifiers: [Modifier.M3] })
            }
        ].forEach(binding => {
            registry.registerDefaultKeyBinding(binding);
        });

    }

}