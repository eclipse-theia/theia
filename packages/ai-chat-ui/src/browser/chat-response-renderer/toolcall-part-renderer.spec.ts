// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { condenseArguments } from './toolcall-utils';

describe('condenseArguments', () => {

    it('returns undefined for empty object', () => {
        expect(condenseArguments('{}')).to.be.undefined;
    });

    it('returns undefined for whitespace-only string', () => {
        expect(condenseArguments('   ')).to.be.undefined;
    });

    it('returns undefined for empty string', () => {
        expect(condenseArguments('')).to.be.undefined;
    });

    it('returns the raw string (possibly truncated) for invalid JSON', () => {
        expect(condenseArguments('not valid json')).to.equal('not valid json');
        expect(condenseArguments('{invalid}')).to.equal('{invalid}');
    });

    it('condenses single string parameter as value only', () => {
        const result = condenseArguments('{"query": "search term"}');
        expect(result).to.equal('search term');
    });

    it('shows all key-value pairs for multiple parameters', () => {
        const result = condenseArguments('{"query": "search term", "limit": 10}');
        expect(result).to.equal('query: search term, limit: 10');
    });

    it('truncates long path value at 30 chars', () => {
        const longPath = '/very/long/file/path/to/something.ts';
        const result = condenseArguments(`{"path": "${longPath}"}`);
        expect(result).to.equal('/very/long/file/path/to/someth\u2026');
    });

    it('shows all key-value pairs for multiple parameters', () => {
        const result = condenseArguments('{"path": "/some/path", "mode": "read"}');
        expect(result).to.equal('path: /some/path, mode: read');
    });

    it('shows {\u2026} for single nested object param', () => {
        const result = condenseArguments('{"config": {"nested": true}}');
        expect(result).to.equal('{\u2026}');
    });

    it('shows [\u2026] for single array param', () => {
        const result = condenseArguments('{"items": [1, 2, 3]}');
        expect(result).to.equal('[\u2026]');
    });

    it('shows number value only for single param', () => {
        const result = condenseArguments('{"count": 42}');
        expect(result).to.equal('42');
    });

    it('shows boolean value only for single param', () => {
        const result = condenseArguments('{"enabled": true}');
        expect(result).to.equal('true');
    });

    it('shows null value only for single param', () => {
        const result = condenseArguments('{"value": null}');
        expect(result).to.equal('null');
    });

    it('shows all key-value pairs for multiple mixed parameters', () => {
        const result = condenseArguments('{"config": {"nested": true}, "debug": true}');
        expect(result).to.equal('config: {\u2026}, debug: true');
    });

    it('shows all key-value pairs for multiple short parameters', () => {
        const result = condenseArguments('{"a": "1", "b": "2"}');
        expect(result).to.equal('a: 1, b: 2');
    });

    it('truncates total output exceeding 80 chars with \u2026', () => {
        const veryLongPath = '/this/is/a/very/long/path/that/exceeds/eighty/characters/total/length/somefile.ts';
        const result = condenseArguments(`{"path": "${veryLongPath}"}`);
        expect(result).to.not.be.undefined;
        expect(result!.length).to.be.at.most(81);
        expect(result!.endsWith('\u2026')).to.be.true;
    });

    it('truncates string values longer than 30 chars', () => {
        const longValue = 'abcdefghijklmnopqrstuvwxyz12345678';
        const result = condenseArguments(`{"key": "${longValue}"}`);
        expect(result).to.equal('abcdefghijklmnopqrstuvwxyz1234\u2026');
    });

    it('handles top-level array', () => {
        const result = condenseArguments('[1, 2, 3]');
        expect(result).to.equal('[1,2,3]');
    });

    it('handles top-level string', () => {
        const result = condenseArguments('"hello"');
        expect(result).to.equal('"hello"');
    });

    it('handles top-level number', () => {
        const result = condenseArguments('42');
        expect(result).to.equal('42');
    });

    it('truncates long top-level array', () => {
        const longArray = JSON.stringify(Array(50).fill('item'));
        const result = condenseArguments(longArray);
        expect(result).to.not.be.undefined;
        expect(result!.length).to.be.at.most(81);
        expect(result!.endsWith('\u2026')).to.be.true;
    });

});
