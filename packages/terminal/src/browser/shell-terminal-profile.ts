// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import { URI } from '@theia/core';
import { TerminalService } from './base/terminal-service';
import { TerminalWidget, TerminalWidgetOptions } from './base/terminal-widget';
import { TerminalProfile } from './terminal-profile-service';

export class ShellTerminalProfile implements TerminalProfile {

    get shellPath(): string | undefined {
        return this.options.shellPath;
    }

    constructor(protected readonly terminalService: TerminalService, protected readonly options: TerminalWidgetOptions) { }

    async start(): Promise<TerminalWidget> {
        const widget = await this.terminalService.newTerminal(this.options);
        widget.start();
        return widget;
    }

    /**
     * Makes a copy of this profile modified with the options given
     * as an argument.
     * @param options the options to override
     * @returns a modified copy of this profile
     */
    modify(options: { cwd?: string | URI }): TerminalProfile {
        return new ShellTerminalProfile(this.terminalService, { ...this.options, ...options });
    }
}
