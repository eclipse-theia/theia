// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { TerminalProcess, TerminalProcessOptions } from './terminal-process';

export const TaskTerminalProcessFactory = Symbol('TaskTerminalProcessFactory');
export interface TaskTerminalProcessFactory {
    (options: TerminalProcessOptions): TaskTerminalProcess;
}

@injectable()
export class TaskTerminalProcess extends TerminalProcess {

    public exited = false;
    public attachmentAttempted = false;

    protected override onTerminalExit(code: number | undefined, signal: string | undefined): void {
        this.emitOnExit(code, signal);
        this.exited = true;
        // Unregister process only if task terminal already attached (or failed attach),
        // Fixes https://github.com/eclipse-theia/theia/issues/2961
        if (this.attachmentAttempted) {
            this.unregisterProcess();
        }
    }

}
