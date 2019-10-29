/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { HelloMessage, HgCommandServer, OutputChunk } from './hg-command-server';
import { expect } from 'chai';

describe('HgCommandServer', () => {
    describe('parseOutputChunk', () => {
        it('parses a hello message on the output channel', () => {
            const data = [
                111, 0, 0, 0, 63, 99, 97, 112, 97, 98, 105, 108, 105, 116, 105, 101, 115, 58, 32, 103, 101, 116, 101, 110, 99,
                111, 100, 105, 110, 103, 32, 114, 117, 110, 99, 111, 109, 109, 97, 110, 100, 10, 101, 110, 99, 111, 100, 105,
                110, 103, 58, 32, 85, 84, 70, 45, 56, 10, 112, 105, 100, 58, 32, 49, 57, 57, 50, 48
            ];

            const result = HgCommandServer.parseOutputChunk(Buffer.from(data), 0, 'UTF-8');

            expect(result).to.deep.equal({
                chunk: { channel: 'o', body: 'capabilities: getencoding runcommand\nencoding: UTF-8\npid: 19920' },
                size: data.length
            });
        });

        it('parses a Line channel message', () => {
            const data = [ 76, 0, 0, 16, 0 ];
            const result = HgCommandServer.parseOutputChunk(Buffer.from(data), 0, 'UTF-8');

            expect(result).to.deep.equal({
                chunk: { channel: 'L', length: 4096 },
                size: data.length
            });
        });

        it('parses an output channel chunk', () => {
            const data = [
                111, 0, 0, 0, 45, 100, 101, 115, 116, 105, 110, 97, 116, 105, 111, 110, 32, 100, 105, 114,
                101, 99, 116, 111, 114, 121, 58, 32, 112, 101, 108, 105, 111, 110, 45, 101, 120, 97, 109,
                112, 108, 101, 45, 99, 111, 109, 109, 111, 110, 10
            ];

            const result = HgCommandServer.parseOutputChunk(Buffer.from(data), 0, 'UTF-8');

            expect(result).to.deep.equal({
                chunk: { channel: 'o', body: 'destination directory: pelion-example-common\n' },
                size: data.length
            });
        });

        it('parses an error channel chunk', () => {
            const data = [
                101, 0, 0, 0, 33, 97, 98, 111, 114, 116, 58, 32, 72, 84, 84, 80, 32, 69, 114, 114, 111, 114, 32, 52, 48, 52,
                58, 32, 78, 111, 116, 32, 70, 111, 117, 110, 100, 10
            ];

            const result = HgCommandServer.parseOutputChunk(Buffer.from(data), 0, 'UTF-8');

            expect(result).to.deep.equal({
                chunk: { body: 'abort: HTTP Error 404: Not Found\n', channel: 'e' },
                size: data.length
            });
        });

        it('parses a result channel chunk with exit code 0', () => {
            const data = [ 114, 0, 0, 0, 4, 0, 0, 0, 0 ];
            const result = HgCommandServer.parseOutputChunk(Buffer.from(data), 0, 'UTF-8');

            expect(result).to.deep.equal({
                chunk: { body: 0, channel: 'r' },
                size: data.length
            });
        });

        it('parses a result channel chunk with a non-zero exit code', () => {
            const data = [ 114, 0, 0, 0, 4, 0, 0, 0, 255 ];
            const result = HgCommandServer.parseOutputChunk(Buffer.from(data), 0, 'UTF-8');

            expect(result).to.deep.equal({
                chunk: { body: 255, channel: 'r' },
                size: data.length
            });
        });

        it('respects the start argument', () => {
            // A result message padded at the start
            const data = [ 10, 0, 3, 114, 0, 0, 0, 4, 0, 0, 0, 0 ];
            const result = HgCommandServer.parseOutputChunk(Buffer.from(data), 3, 'UTF-8');

            expect(result).to.deep.equal({
                chunk: { body: 0, channel: 'r' },
                size: 9
            });
        });

        it('throws with an unexpected channel', () => {
            const data = [ 42, 0, 0, 0, 0, 0 ];

            expect(() => {
                HgCommandServer.parseOutputChunk(Buffer.from(data), 0, 'UTF-8');
            }).to.throw();
        });
    });

    describe('parseCapabilitiesAndEncoding', () => {
        it('throws when given a non-output chunk', () => {
            const chunk: OutputChunk = { channel: 'e', body: 'Nothing is working' };

            expect(() => {
                HgCommandServer.parseCapabilitiesAndEncoding(chunk);
            }).to.throw('"o" channel');
        });

        it('throws when given an invalid message', () => {
            const chunk: OutputChunk = { channel: 'o', body: 'not a hello message\n' };

            expect(() => {
                HgCommandServer.parseCapabilitiesAndEncoding(chunk);
            }).to.throw('Invalid server hello message');
        });

        it('throws when the encoding is missing', () => {
            const chunk: OutputChunk = { channel: 'o', body: 'capabilities: getencoding runcommand\npid: 19920' };

            expect(() => {
                HgCommandServer.parseCapabilitiesAndEncoding(chunk);
            }).to.throw('Invalid server hello message');
        });

        it('parses a correct chunk', () => {
            const chunk: OutputChunk = { channel: 'o', body: 'capabilities: getencoding runcommand\nencoding: UTF-8\npid: 19920' };
            const result = HgCommandServer.parseCapabilitiesAndEncoding(chunk);

            const expected: HelloMessage = {
                capabilities: [ 'getencoding', 'runcommand' ],
                encoding: 'UTF-8'
            };

            expect(result).to.deep.equal(expected);
        });
    });
});
