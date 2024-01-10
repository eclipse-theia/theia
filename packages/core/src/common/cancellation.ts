// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from './event';
import { isBoolean, isObject } from './types';
import { Disposable } from './disposable';

export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    /*
     * An event emitted when cancellation is requested
     * @event
     */
    readonly onCancellationRequested: Event<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shortcutEvent: Event<void> = Object.freeze(Object.assign(function (callback: any, context?: any): any {
    const handle = setTimeout(callback.bind(context), 0);
    return { dispose(): void { clearTimeout(handle); } };
}, {
    get maxListeners(): number { return 0; },
    set maxListeners(maxListeners: number) { }
}));

export namespace CancellationToken {

    export const None: CancellationToken = Object.freeze({
        isCancellationRequested: false,
        onCancellationRequested: Event.None
    });

    export const Cancelled: CancellationToken = Object.freeze({
        isCancellationRequested: true,
        onCancellationRequested: shortcutEvent
    });

    export function is(value: unknown): value is CancellationToken {
        return isObject<CancellationToken>(value) && (value === CancellationToken.None
            || value === CancellationToken.Cancelled
            || (isBoolean(value.isCancellationRequested) && !!value.onCancellationRequested));
    }
}

export class CancellationError extends Error {
    constructor() {
        super('Canceled');
        this.name = this.message;
    }
}

class MutableToken implements CancellationToken {

    private _isCancelled: boolean = false;
    private _emitter: Emitter<void> | undefined;

    public cancel(): void {
        if (!this._isCancelled) {
            this._isCancelled = true;
            if (this._emitter) {
                this._emitter.fire(undefined);
                this._emitter = undefined;
            }
        }
    }

    get isCancellationRequested(): boolean {
        return this._isCancelled;
    }

    get onCancellationRequested(): Event<void> {
        if (this._isCancelled) {
            return shortcutEvent;
        }
        if (!this._emitter) {
            this._emitter = new Emitter<void>();
        }
        return this._emitter.event;
    }

    public dispose(): void {
        if (this._emitter) {
            this._emitter.dispose();
            this._emitter = undefined;
        }
    }
}

export class CancellationTokenSource {

    private _token: CancellationToken;
    private _parentListener?: Disposable = undefined;

    constructor(parent?: CancellationToken) {
        this._parentListener = parent && parent.onCancellationRequested(this.cancel, this);
    }

    get token(): CancellationToken {
        if (!this._token) {
            // be lazy and create the token only when
            // actually needed
            this._token = new MutableToken();
        }
        return this._token;
    }

    cancel(): void {
        if (!this._token) {
            // save an object by returning the default
            // cancelled token when cancellation happens
            // before someone asks for the token
            this._token = CancellationToken.Cancelled;
        } else if (this._token !== CancellationToken.Cancelled) {
            (<MutableToken>this._token).cancel();
        }
    }

    dispose(): void {
        this.cancel();
        this._parentListener?.dispose();
        if (!this._token) {
            // ensure to initialize with an empty token if we had none
            this._token = CancellationToken.None;

        } else if (this._token instanceof MutableToken) {
            // actually dispose
            this._token.dispose();
        }
    }
}

const cancelledMessage = 'Cancelled';

export function cancelled(): Error {
    return new Error(cancelledMessage);
}

export function isCancelled(err: Error | undefined): boolean {
    return !!err && err.message === cancelledMessage;
}

export function checkCancelled(token?: CancellationToken): void {
    if (!!token && token.isCancellationRequested) {
        throw cancelled();
    }
}
