// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { SecondInstanceArgv } from './window';

describe('SecondInstanceArgv', () => {

    describe('encode / decode', () => {
        it('round-trips an argv array', () => {
            const argv = ['--attach-container', 'my-container', '--session-preference', 'foo.bar=1'];
            const decoded = SecondInstanceArgv.decode(SecondInstanceArgv.encode(argv));
            expect(decoded).to.deep.equal(argv);
        });

        it('produces a query-safe value (no reserved characters)', () => {
            const encoded = SecondInstanceArgv.encode(['--session-preference', 'a=b & c=d']);
            expect(encoded).to.not.match(/[&= ]/);
        });

        it('round-trips values that survive URLSearchParams decoding', () => {
            const argv = ['--session-preference', 'foo="a & b"'];
            const encoded = SecondInstanceArgv.encode(argv);
            // Simulate the round-trip through the window URL: URLSearchParams decodes percent-escapes.
            const viaSearchParams = new URLSearchParams(`x=${encoded}`).get('x');
            expect(SecondInstanceArgv.decode(viaSearchParams)).to.deep.equal(argv);
        });

        it('decodes to an empty array for undefined / null / empty input', () => {
            expect(SecondInstanceArgv.decode(undefined)).to.deep.equal([]);
            // eslint-disable-next-line no-null/no-null
            expect(SecondInstanceArgv.decode(null)).to.deep.equal([]);
            expect(SecondInstanceArgv.decode('')).to.deep.equal([]);
        });

        it('decodes to an empty array for malformed input', () => {
            expect(SecondInstanceArgv.decode('not-json')).to.deep.equal([]);
            expect(SecondInstanceArgv.decode('{"a":1}')).to.deep.equal([]);
        });
    });

    describe('getValue', () => {
        it('reads a "--name value" option', () => {
            expect(SecondInstanceArgv.getValue(['--attach-container', 'B'], 'attach-container')).to.equal('B');
        });

        it('reads a "--name=value" option', () => {
            expect(SecondInstanceArgv.getValue(['--attach-container=B'], 'attach-container')).to.equal('B');
        });

        it('returns the last value when the option is repeated', () => {
            expect(SecondInstanceArgv.getValue(['--attach-container', 'A', '--attach-container', 'B'], 'attach-container')).to.equal('B');
        });

        it('returns undefined when the option is absent', () => {
            expect(SecondInstanceArgv.getValue(['--dev-json'], 'attach-container')).to.be.undefined;
        });

        it('does not treat a following flag as the value', () => {
            expect(SecondInstanceArgv.getValue(['--attach-container', '--dev-json'], 'attach-container')).to.be.undefined;
        });
    });

    describe('getValues', () => {
        it('collects every occurrence of a repeatable option', () => {
            const argv = ['--session-preference', 'a=1', '--session-preference=b=2', '--other', 'x'];
            expect(SecondInstanceArgv.getValues(argv, 'session-preference')).to.deep.equal(['a=1', 'b=2']);
        });

        it('returns an empty array when absent', () => {
            expect(SecondInstanceArgv.getValues(['--other'], 'session-preference')).to.deep.equal([]);
        });
    });

    describe('isNegated', () => {
        it('detects a "--no-name" flag', () => {
            expect(SecondInstanceArgv.isNegated(['--no-dev-json'], 'dev-json')).to.be.true;
        });

        it('detects a "--name=false" flag', () => {
            expect(SecondInstanceArgv.isNegated(['--dev-json=false'], 'dev-json')).to.be.true;
        });

        it('is false when the flag is present positively or absent', () => {
            expect(SecondInstanceArgv.isNegated(['--dev-json'], 'dev-json')).to.be.false;
            expect(SecondInstanceArgv.isNegated([], 'dev-json')).to.be.false;
        });
    });
});
