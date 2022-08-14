// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'chai';
import { Emitter, Event } from '../event';
import { Connection } from './connection';
import { DefaultTransformableConnection } from './transformer';

describe('DefaultTransformableConnection', () => {

    it('should encode and decode with one MessageTransformer', async () => {
        const connection = createEchoConnection<string>();
        const transformed = new DefaultTransformableConnection(connection)
            .addTransform<{ message: string }>({
                decode: (message, emit) => emit({ message }),
                encode: (message, write) => write(message.message)
            });
        const connectionMessage = Event.wait(connection.onMessage);
        const transformedMessage = Event.wait(transformed.onMessage);
        transformed.sendMessage({ message: 'test' });
        expect(await connectionMessage).equal('test');
        expect(await transformedMessage).deep.equal({ message: 'test' });
    });

    it('should encode and decode with more than one MessageTransformer', async () => {
        const connection = createEchoConnection<string>();
        const transformed = new DefaultTransformableConnection(connection)
            .addTransform<{ a: string }>({
                decode: (message, emit) => emit({ a: message }),
                encode: (message, write) => write(message.a)
            })
            .addTransform<{ b: string }>({
                decode: (message, emit) => emit({ b: message.a }),
                encode: (message, write) => write({ a: message.b })
            })
            .addTransform<{ c: string }>({
                decode: (message, emit) => emit({ c: message.b }),
                encode: (message, write) => write({ b: message.c })
            });
        const connectionMessage = Event.wait(connection.onMessage);
        const transformedMessage = Event.wait(transformed.onMessage);
        transformed.sendMessage({ c: 'test' });
        expect(await connectionMessage).equal('test');
        expect(await transformedMessage).deep.equal({ c: 'test' });
    });
});

function createEchoConnection<T>(): Connection<T> {
    const messageEmitter = new Emitter();
    return {
        state: Connection.State.OPENED,
        onClose: Event.None,
        onError: Event.None,
        onMessage: messageEmitter.event,
        onOpen: Event.None,
        sendMessage: message => messageEmitter.fire(message),
        close: () => { }
    };
}
