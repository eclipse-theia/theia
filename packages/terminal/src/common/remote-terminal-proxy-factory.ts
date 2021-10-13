/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Emitter, JsonRpcProxyFactory } from '@theia/core';
import { TerminalDataEvent, TerminalExitEvent } from '@theia/process/lib/node';
import { RemoteTerminalProxy } from './remote-terminal-protocol';

/**
 * This class supports `onEvent(callback)` APIs for `RemoteTerminalProxy` instances and can be disposed.
 */
export class RemoteTerminalProxyFactory extends JsonRpcProxyFactory<RemoteTerminalProxy> {

    readonly proxy = new Proxy({}, this) as RemoteTerminalProxy;

    protected disposed: boolean = false;
    protected emitters: Record<string, Emitter> = {
        onData: new Emitter<TerminalDataEvent>(),
        onExit: new Emitter<TerminalExitEvent>(),
        onClose: new Emitter<TerminalExitEvent>()
    };

    get(target: never, property: PropertyKey, receiver: never): any {
        if (this.disposed) {
            throw new Error('this proxy is disposed');
        }
        if (property === 'dispose') {
            return this.dispose();
        }
        if (typeof property === 'string' && property in this.emitters) {
            return this.emitters[property].event;
        }
        return super.get(target, property, receiver);
    }

    protected onNotification(event: string, ...args: any[]): void {
        if (event in this.emitters) {
            this.emitters[event].fire(args[0]);
        }
    }

    protected dispose(): void {
        this.connectionPromise.then(connection => connection.dispose());
        for (const emitter of Object.values(this.emitters)) {
            emitter.dispose();
        }
        this.disposed = true;
    }
}
