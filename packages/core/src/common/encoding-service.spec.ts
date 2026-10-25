// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { EncodingService } from './encoding-service';

describe('EncodingService', () => {

    describe('guessEncodingByBuffer', () => {

        it('guesses the encoding when there is no global Buffer, as in the frontend bundle', async () => {
            class TestEncodingService extends EncodingService {
                override guessEncodingByBuffer(data: Buffer): Promise<string | undefined> {
                    return super.guessEncodingByBuffer(data);
                }
            }
            const buffer = Buffer.from('Grüße aus München\n'.repeat(20));
            const globalBuffer = globalThis.Buffer;
            (globalThis as { Buffer?: unknown }).Buffer = undefined;
            try {
                expect(await new TestEncodingService().guessEncodingByBuffer(buffer)).to.equal('utf8');
            } finally {
                globalThis.Buffer = globalBuffer;
            }
        });
    });
});
