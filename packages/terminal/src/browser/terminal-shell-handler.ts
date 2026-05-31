// *****************************************************************************
// Copyright (C) 2017-2026 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ViewColumn } from '@theia/core/lib/common';
import { ApplicationShell, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { TerminalCreationHandler } from './terminal-creation-handler';
import { TerminalWidget, TerminalLocation } from './base/terminal-widget';
import { TerminalService } from './base/terminal-service';

/**
 * Default {@link TerminalCreationHandler} that places terminals into the
 * application shell. This handles the standard panel/editor/split placement
 * logic and always claims the terminal (returning `true`).
 *
 * Because it always claims, it should run at the lowest priority so that
 * other handlers (e.g. the terminal manager) get a chance to intercept first.
 */
@injectable()
export class TerminalShellHandler implements TerminalCreationHandler {

    readonly priority = -100;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    async onWillOpenTerminal(terminal: TerminalWidget, options?: WidgetOpenerOptions): Promise<boolean> {
        const area = terminal.location === TerminalLocation.Editor ? 'main' : 'bottom';
        const widgetOptions: ApplicationShell.WidgetOptions = { area, ...options?.widgetOptions };
        let preserveFocus = false;

        if (typeof terminal.location === 'object') {
            if ('parentTerminal' in terminal.location) {
                widgetOptions.ref = this.terminalService.getById(terminal.location.parentTerminal);
                widgetOptions.mode = 'split-right';
            } else if ('viewColumn' in terminal.location) {
                preserveFocus = terminal.location.preserveFocus ?? false;
                switch (terminal.location.viewColumn) {
                    case ViewColumn.Active:
                        widgetOptions.ref = this.shell.currentWidget;
                        widgetOptions.mode = 'tab-after';
                        break;
                    case ViewColumn.Beside:
                        widgetOptions.ref = this.shell.currentWidget;
                        widgetOptions.mode = 'split-right';
                        break;
                    default:
                        widgetOptions.area = 'main';
                        const mainAreaTerminals = this.shell.getWidgets('main').filter(w => w instanceof TerminalWidget && w.isVisible);
                        const column = Math.min(terminal.location.viewColumn, mainAreaTerminals.length);
                        widgetOptions.mode = terminal.location.viewColumn <= mainAreaTerminals.length ? 'split-left' : 'split-right';
                        widgetOptions.ref = mainAreaTerminals[column - 1];
                }
            }
        }

        const op: WidgetOpenerOptions = {
            mode: 'activate',
            ...options,
            widgetOptions
        };
        if (!terminal.isAttached) {
            this.shell.addWidget(terminal, op.widgetOptions);
        }
        if (op.mode === 'activate' && !preserveFocus) {
            this.shell.activateWidget(terminal.id);
        } else if (op.mode === 'reveal' || preserveFocus) {
            this.shell.revealWidget(terminal.id);
        }

        return true;
    }
}
