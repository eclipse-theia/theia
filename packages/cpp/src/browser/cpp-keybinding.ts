/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { injectable, inject } from 'inversify';
import { isOSX } from '@theia/core/lib/common/os';
import { EditorManager } from '@theia/editor/lib/browser';
import {
    KeybindingContext, Keybinding, KeybindingContribution, KeybindingRegistry
} from '@theia/core/lib/browser';
import { editorContainsCppFiles } from './cpp-commands';

@injectable()
export class CppKeybindingContext implements KeybindingContext {
    constructor( @inject(EditorManager) protected readonly editorService: EditorManager) { }

    id = 'cpp.keybinding.context';

    isEnabled(arg: Keybinding): boolean {
        return editorContainsCppFiles(this.editorService);
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
                keybinding: isOSX ? 'option+cmd+o' : 'alt+o'
            }
        ].forEach(binding => {
            registry.registerKeybinding(binding);
        });

    }

}
