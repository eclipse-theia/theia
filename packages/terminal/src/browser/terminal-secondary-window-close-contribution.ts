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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Widget } from '@theia/core/lib/browser/widgets';
import { SecondaryWindowCloseContribution } from '@theia/core/lib/browser/window/secondary-window-close-contribution';
import { TerminalWidget } from './base/terminal-widget';
import { TerminalPreferences } from '../common/terminal-preferences';

/**
 * Moves terminals back to the main window when their secondary window is closed if closing the application
 * would ask for confirmation for them, see the `terminal.integrated.confirmOnExit` preference.
 */
@injectable()
export class TerminalSecondaryWindowCloseContribution implements SecondaryWindowCloseContribution {

    @inject(TerminalPreferences)
    protected readonly terminalPreferences: TerminalPreferences;

    async shouldRestoreOnClose(widget: Widget): Promise<boolean | undefined> {
        if (!(widget instanceof TerminalWidget)) {
            return undefined;
        }
        switch (this.terminalPreferences['terminal.integrated.confirmOnExit']) {
            case 'always':
                return true;
            case 'hasChildProcesses':
                return widget.hasChildProcesses();
            default:
                return false;
        }
    }
}
