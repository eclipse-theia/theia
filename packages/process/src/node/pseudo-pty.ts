/********************************************************************************
 * Copyright (C) 2020 Alibaba Inc. and others.
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

import { IPty } from '@theia/node-pty';
import { Event } from '@theia/core';

export class PseudoPty implements IPty {

    readonly pid: number = -1;

    readonly cols: number = -1;

    readonly rows: number = -1;

    readonly process: string = '';

    handleFlowControl = false;

    readonly onData: Event<string> = Event.None;

    readonly onExit: Event<{ exitCode: number, signal?: number }> = Event.None;

    on(event: string, listener: (data: string) => void): void;

    on(event: string, listener: (exitCode: number, signal?: number) => void): void;

    on(event: string, listener: (error?: string) => void): void;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, listener: (...args: any[]) => void): void { }

    resize(columns: number, rows: number): void { }

    write(data: string): void { }

    kill(signal?: string): void { }

}
