// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from 'inversify';
import { AnyFunction, FunctionUtils, IpcChannel, TheiaIpcWindow } from '../electron-common';

@injectable()
export class TheiaIpcWindowImpl implements TheiaIpcWindow {

    protected canary = 'theia-ipc-window-channel-message';
    protected messageListeners = new Map<string, Map<AnyFunction, boolean>>();

    @inject(FunctionUtils)
    protected futils: FunctionUtils;

    @postConstruct()
    protected postConstruct(): void {
        window.addEventListener('message', event => this.handleMessageEvent(event));
    }

    on(channel: IpcChannel, listener: AnyFunction, thisArg?: object): this {
        this.getOrCreateListeners(channel.channel).set(this.futils.bindfn(listener, thisArg), false);
        return this;
    }

    once(channel: IpcChannel, listener: AnyFunction, thisArg?: object): this {
        this.getOrCreateListeners(channel.channel).set(this.futils.bindfn(listener, thisArg), true);
        return this;
    }

    postMessage(targetOrigin: string, channel: IpcChannel, message: unknown, transfer?: MessagePort[]): void {
        window.postMessage([this.canary, channel.channel, message], targetOrigin, transfer);
    }

    removeAllListeners(channel: IpcChannel): this {
        this.messageListeners.delete(channel.channel);
        return this;
    }

    removeListener(channel: IpcChannel, listener: AnyFunction, thisArg?: object): this {
        this.messageListeners.get(channel.channel)?.delete(this.futils.bindfn(listener, thisArg));
        return this;
    }

    protected getOrCreateListeners(channel: string): Map<AnyFunction, boolean> {
        let listeners = this.messageListeners.get(channel);
        if (!listeners) {
            this.messageListeners.set(channel, listeners = new Map());
        }
        return listeners;
    }

    protected handleMessageEvent(event: MessageEvent): void {
        // Electron-specific check. Prevents virtual hosts from trying to send
        // messages through this custom protocol. Otherwise a script living in
        // a virtual host could send a message potentially targeting handlers
        // in the Electron main context.
        if (event.origin !== 'file://') {
            return;
        }
        if (!Array.isArray(event.data)) {
            return;
        }
        const [canary, channel, message] = event.data;
        if (!this.isCanary(canary) || typeof channel !== 'string') {
            return;
        }
        const listeners = this.messageListeners.get(channel);
        if (!listeners) {
            console.debug(`received message without listeners: "${channel}"`);
            return;
        }
        const listenersToDelete = new Set<AnyFunction>();
        listeners.forEach((once, listener) => {
            if (once) {
                listenersToDelete.add(listener);
            }
            try {
                listener(event, message);
            } catch (error) {
                console.error(error);
            }
        });
        listenersToDelete.forEach(listener => listeners.delete(listener));
        if (listeners.size === 0) {
            this.messageListeners.delete(channel);
        }
    }

    protected isCanary(value: unknown): boolean {
        return typeof value === 'string' && value === this.canary;
    }
}
