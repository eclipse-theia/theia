// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { CommandContribution, CommandRegistry } from '../common/command.js';
import { CommonCommands } from '../browser/common-commands.js';
import { WindowFocusService } from '../browser/window/window-focus-service.js';

@injectable()
export class ElectronClipboardCommandContribution implements CommandContribution {

    @inject(WindowFocusService)
    protected readonly windowFocusService: WindowFocusService;

    registerCommands(registry: CommandRegistry): void {
        for (const command of ['copy', 'cut'] as const) {
            registry.registerHandler(command === 'copy' ? CommonCommands.COPY.id : CommonCommands.CUT.id, {
                isEnabled: () => this.isInputWithoutSelectionApi(),
                execute: () => this.getFocusedWindow().electronTheiaCore.copyOrCutSelection(command)
            });
        }
    }

    protected getFocusedWindow(): Window {
        return this.windowFocusService.focusedWindow ?? window;
    }

    protected isInputWithoutSelectionApi(): boolean {
        const active = this.getFocusedWindow().document.activeElement;
        return active?.tagName === 'INPUT' && typeof (active as HTMLInputElement).selectionStart !== 'number';
    }
}
