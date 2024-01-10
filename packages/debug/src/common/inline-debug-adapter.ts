// *****************************************************************************
// Copyright (C) 2021 Red Hat, Inc. and others.
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

import { Emitter, Event } from '@theia/core/lib/common/event';
import { DebugAdapter } from './debug-model';
import * as theia from '@theia/plugin';

/**
 * A debug adapter for using the inline implementation from a plugin.
 */
export class InlineDebugAdapter implements DebugAdapter {
    private messageReceivedEmitter = new Emitter<string>();
    onMessageReceived: Event<string> = this.messageReceivedEmitter.event;
    onError: Event<Error> = Event.None;
    private closeEmitter = new Emitter<void>();
    onClose: Event<void> = this.closeEmitter.event;

    constructor(private debugAdapter: theia.DebugAdapter) {
        this.debugAdapter.onDidSendMessage(msg => {
            this.messageReceivedEmitter.fire(JSON.stringify(msg));
        });
    }

    async start(): Promise<void> {
    }

    send(message: string): void {
        this.debugAdapter.handleMessage(JSON.parse(message));
    }

    async stop(): Promise<void> {
        this.debugAdapter.dispose();
    }
}
