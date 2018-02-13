/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { EditorManager } from "./editor-manager";
import { KeybindingContext, Keybinding, KeybindingContribution, KeybindingRegistry } from "@theia/core/lib/browser/keybinding";

@injectable()
export class EditorKeybindingContext implements KeybindingContext {

    constructor(@inject(EditorManager) protected readonly editorService: EditorManager) { }

    id = 'editor.keybinding.context';

    isEnabled(arg?: Keybinding) {
        return this.editorService && !!this.editorService.active;
    }

}

@injectable()
export class EditorKeybindingContribution implements KeybindingContribution {

    constructor(
        @inject(EditorKeybindingContext) protected readonly editorKeybindingContext: EditorKeybindingContext
    ) { }

    registerKeybindings(registry: KeybindingRegistry): void {
    }

}
