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

import { injectable } from 'inversify';
import { Emitter, Event } from '../event';
import { kOnSendAll, kOnSendTo, RpcEvent, SendAllEvent, SendToEvent } from './rpc-server';

@injectable()
export class RpcEventImpl<T> implements RpcEvent<T> {

    #sendAllEmitter = new Emitter<SendAllEvent<T>>();
    #sendToEmitter = new Emitter<SendToEvent<T>>();

    get [kOnSendAll](): Event<SendAllEvent<T>> {
        return this.#sendAllEmitter.event;
    }

    get [kOnSendTo](): Event<SendToEvent<T>> {
        return this.#sendToEmitter.event;
    }

    sendAll(value: T, exceptions?: unknown[] | undefined): void {
        this.#sendAllEmitter.fire({ value, exceptions });
    }

    sendTo(value: T, targets: unknown[]): void {
        this.#sendToEmitter.fire({ value, targets });
    }
}
