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
import { CliPreferenceEntry } from './cli-preferences';

describe('CliPreferenceEntry.parse', () => {

    it('parses a KEY=JSONVALUE assignment', () => {
        expect(CliPreferenceEntry.parse('editor.fontSize=14')).to.deep.equal(['editor.fontSize', 14]);
    });

    it('parses boolean and string JSON values', () => {
        expect(CliPreferenceEntry.parse('foo.enabled=true')).to.deep.equal(['foo.enabled', true]);
        expect(CliPreferenceEntry.parse('foo.label="hello"')).to.deep.equal(['foo.label', 'hello']);
    });

    it('keeps "=" characters that are part of the value', () => {
        expect(CliPreferenceEntry.parse('foo.expr="a=b"')).to.deep.equal(['foo.expr', 'a=b']);
    });

    it('decodes a base64-encoded value', () => {
        // base64 of the JSON value `42`
        expect(CliPreferenceEntry.parse('foo.num=base64:NDI=')).to.deep.equal(['foo.num', 42]);
    });

    it('returns undefined when there is no key', () => {
        expect(CliPreferenceEntry.parse('=1')).to.be.undefined;
    });

    it('returns undefined when there is no "="', () => {
        expect(CliPreferenceEntry.parse('noequals')).to.be.undefined;
    });

    it('returns undefined for an invalid JSON value', () => {
        expect(CliPreferenceEntry.parse('foo.bar=not json')).to.be.undefined;
    });

    describe('parseAll', () => {
        it('parses and filters a list, dropping invalid entries', () => {
            const result = CliPreferenceEntry.parseAll(['a=1', 'bad', 'b="x"']);
            expect(result).to.deep.equal([['a', 1], ['b', 'x']]);
        });
    });

    describe('toArg', () => {
        it('formats an entry as a base64-encoded CLI argument', () => {
            // base64 of the JSON value `42`
            expect(CliPreferenceEntry.toArg('session-preference', ['foo.num', 42])).to.equal('--session-preference=foo.num=base64:NDI=');
        });

        it('round-trips a value with shell-special characters through toArg + parse', () => {
            const entry: [string, unknown] = ['foo.expr', '$HOME && "quoted"'];
            const arg = CliPreferenceEntry.toArg('session-preference', entry);
            // The value part of `--session-preference=<value>` must parse back to the original entry.
            const value = arg.substring('--session-preference='.length);
            expect(CliPreferenceEntry.parse(value)).to.deep.equal(entry);
        });
    });
});
