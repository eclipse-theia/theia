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

    it('returns "..." for invalid JSON', () => {
        expect(condenseArguments('not valid json')).to.equal('...');
        expect(condenseArguments('{invalid}')).to.equal('...');
    });

    it('condenses single string parameter without key name', () => {
        const result = condenseArguments('{"query": "search term"}');
        // Single param shows just the quoted value, no key name
        expect(result).to.equal("'search term'");
    });

    it('shows ... for multiple parameters', () => {
        const result = condenseArguments('{"query": "search term", "limit": 10}');
        expect(result).to.equal('...');
    });

    it('shows full path for single parameter', () => {
        const longPath = '/very/long/file/path/to/something.ts';
        const result = condenseArguments(`{"path": "${longPath}"}`);
        // Single parameter shows quoted value without key name
        expect(result).to.equal("'/very/long/file/path/to/something.ts'");
    });

    it('shows ... for multiple parameters', () => {
        const result = condenseArguments('{"path": "/some/path", "mode": "read"}');
        // Multiple params: just show ...
        expect(result).to.equal('...');
    });

    it('shows {...} for single nested object param', () => {
        const result = condenseArguments('{"config": {"nested": true}}');
        // Single param, no key name
        expect(result).to.equal('{...}');
    });

    it('shows [...] for single array param', () => {
        const result = condenseArguments('{"items": [1, 2, 3]}');
        // Single param, no key name
        expect(result).to.equal('[...]');
    });

    it('shows number value as-is for single param', () => {
        const result = condenseArguments('{"count": 42}');
        // Single param, no key name
        expect(result).to.equal('42');
    });

    it('shows boolean value as-is for single param', () => {
        const result = condenseArguments('{"enabled": true}');
        // Single param, no key name
        expect(result).to.equal('true');
    });

    it('shows null value as-is for single param', () => {
        const result = condenseArguments('{"value": null}');
        // Single param, no key name
        expect(result).to.equal('null');
    });

    it('shows ... for multiple mixed parameters', () => {
        const result = condenseArguments('{"config": {"nested": true}, "debug": true}');
        // Multiple params: just show ...
        expect(result).to.equal('...');
    });

    it('shows ... for multiple parameters regardless of length', () => {
        const result = condenseArguments('{"a": "1", "b": "2"}');
        expect(result).to.equal('...');
    });

    it('truncates single param value exceeding 80 chars', () => {
        const veryLongPath = '/this/is/a/very/long/path/that/exceeds/eighty/characters/total/length/somefile.ts';
        const result = condenseArguments(`{"path": "${veryLongPath}"}`);
        expect(result).to.not.be.undefined;
        expect(result!.length).to.be.at.most(80);
        expect(result!.endsWith('...')).to.be.true;
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
        expect(result!.length).to.be.at.most(80);
        expect(result!.endsWith('...')).to.be.true;
    });

});
