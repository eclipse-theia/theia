// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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

import { expect } from 'chai';
import '@theia/core/lib/common/message-rpc';
import { MsgPackMessageDecoder, MsgPackMessageEncoder } from '@theia/core/lib/common/message-rpc/rpc-message-encoder';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { DuplicateExtensionError } from './plugin-protocol';

describe('DuplicateExtensionError', () => {

    function sendOverRpc(error: Error): unknown {
        const writer = new Uint8ArrayWriteBuffer();
        new MsgPackMessageEncoder().encode(writer, error);
        return new MsgPackMessageDecoder().decode(new Uint8ArrayReadBuffer(writer.getCurrentContents()));
    }

    it('keeps its name and details over RPC', () => {
        const details: DuplicateExtensionError.Details = { id: 'foo.bar', installedVersion: '1.0.0', version: '2.0.0' };
        const received = sendOverRpc(DuplicateExtensionError.create('Extension foo.bar is already installed.', details));
        expect(DuplicateExtensionError.is(received)).to.equal(true);
        expect(DuplicateExtensionError.getDetails(received)).to.deep.equal(details);
    });

    it('has no details if it was created without them', () => {
        const received = sendOverRpc(DuplicateExtensionError.create('Extension foo.bar is already installed.'));
        expect(DuplicateExtensionError.is(received)).to.equal(true);
        expect(DuplicateExtensionError.getDetails(received)).to.equal(undefined);
    });

    it('has no details for other errors', () => {
        expect(DuplicateExtensionError.getDetails(new Error('other'))).to.equal(undefined);
    });
});
