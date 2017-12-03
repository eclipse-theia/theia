/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { EditorManager } from "@theia/editor/lib/browser";
import {
    KeybindingContext, Keybinding, KeybindingContribution, KeybindingRegistry
} from "@theia/core/lib/common";
import { HEADER_AND_SOURCE_FILE_EXTENSIONS } from '../common';

@injectable()
export class CppKeybindingContext implements KeybindingContext {
    constructor( @inject(EditorManager) protected readonly editorService: EditorManager) { }

    id = 'cpp.keybinding.context';

    isEnabled(arg?: Keybinding) {
        if (this.editorService && !!this.editorService.activeEditor) {
            const uri = this.editorService.activeEditor.editor.document.uri;
            return HEADER_AND_SOURCE_FILE_EXTENSIONS.some(value => uri.endsWith("." + value));
        }
        return false;
    }

}

@injectable()
export class CppKeybindingContribution implements KeybindingContribution {

    constructor(
        @inject(CppKeybindingContext) protected readonly cppKeybindingContext: CppKeybindingContext
    ) { }

    registerKeybindings(registry: KeybindingRegistry): void {
        [
            {
                command: 'switch_source_header',
                context: this.cppKeybindingContext.id,
                keybinding: "alt+o"
            }
        ].forEach(binding => {
            registry.registerKeybinding(binding);
        });

    }

}
