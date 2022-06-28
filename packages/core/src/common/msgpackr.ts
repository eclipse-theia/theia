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

import { Packr, Unpackr } from 'msgpackr';
import { MessageTransformer } from './connection/transformer';

export type SomeBuffer = Buffer | ArrayBuffer | Uint8Array;

export class MsgpackrMessageTransformer implements MessageTransformer<SomeBuffer, any> {

    protected packr: Packr;
    protected unpackr: Unpackr;

    constructor(options?: {
        packr?: Packr
        unpackr?: Unpackr
    }) {
        this.packr = options?.packr ?? new Packr();
        this.unpackr = options?.unpackr ?? new Unpackr();
    }

    decode(message: SomeBuffer, emit: (message: any) => void): void {
        emit(this.unpackr.unpack(message instanceof ArrayBuffer ? new Uint8Array(message) : message));
    }

    encode(message: any, write: (message: Uint8Array) => void): void {
        write(this.packr.pack(message));
    }
}
