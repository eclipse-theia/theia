/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { KeybindingContext } from '@theia/core/lib/browser';
import { ConsoleManager } from './console-manager';
import { ConsoleWidget } from './console-widget';

export namespace ConsoleKeybindingContexts {

    /**
     * ID of a keybinding context that is enabled when the console content has the focus.
     */
    export const consoleContentFocus = 'consoleContentFocus';

    /**
     * ID of a keybinding context that is enabled when the console input has the focus.
     */
    export const consoleInputFocus = 'consoleInputFocus';

    /**
     * ID of a keybinding context that is enabled when the console history navigation back is enabled.
     */
    export const consoleNavigationBackEnabled = 'consoleNavigationBackEnabled';

    /**
     * ID of a keybinding context that is enabled when the console history navigation forward is enabled.
     */
    export const consoleNavigationForwardEnabled = 'consoleNavigationForwardEnabled';

}

@injectable()
export class ConsoleInputFocusContext implements KeybindingContext {

    readonly id: string = ConsoleKeybindingContexts.consoleInputFocus;

    @inject(ConsoleManager)
    protected readonly manager: ConsoleManager;

    isEnabled(): boolean {
        const console = this.manager.activeConsole;
        return !!console && this.isConsoleEnabled(console);
    }

    protected isConsoleEnabled(console: ConsoleWidget): boolean {
        return console.hasInputFocus();
    }

}

@injectable()
export class ConsoleContentFocusContext extends ConsoleInputFocusContext {

    readonly id: string = ConsoleKeybindingContexts.consoleContentFocus;

    protected isConsoleEnabled(console: ConsoleWidget): boolean {
        return !console.input.isFocused();
    }

}

@injectable()
export class ConsoleNavigationBackEnabled extends ConsoleInputFocusContext {

    readonly id: string = ConsoleKeybindingContexts.consoleNavigationBackEnabled;

    protected isConsoleEnabled(console: ConsoleWidget): boolean {
        if (!super.isConsoleEnabled(console)) {
            return false;
        }
        const editor = console.input.getControl();
        return editor.getPosition()!.equals({ lineNumber: 1, column: 1 });
    }

}

@injectable()
export class ConsoleNavigationForwardEnabled extends ConsoleInputFocusContext {

    readonly id: string = ConsoleKeybindingContexts.consoleNavigationForwardEnabled;

    protected isConsoleEnabled(console: ConsoleWidget): boolean {
        if (!super.isConsoleEnabled(console)) {
            return false;
        }
        const editor = console.input.getControl();
        const model = console.input.getControl().getModel()!;
        const lineNumber = model.getLineCount();
        const column = model.getLineMaxColumn(lineNumber);
        return editor.getPosition()!.equals({ lineNumber, column });
    }

}
