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
import { CliPreference, CliPreferenceEntry } from './cli-preferences';

describe('CliPreferenceEntry.parse', () => {

    it('parses a KEY=JSONVALUE assignment', () => {
        expect(CliPreferenceEntry.parse('editor.fontSize=14')).to.deep.equal({ preferenceName: 'editor.fontSize', value: 14 });
    });

    it('parses boolean and string JSON values', () => {
        expect(CliPreferenceEntry.parse('foo.enabled=true')).to.deep.equal({ preferenceName: 'foo.enabled', value: true });
        expect(CliPreferenceEntry.parse('foo.label="hello"')).to.deep.equal({ preferenceName: 'foo.label', value: 'hello' });
    });

    it('keeps "=" characters that are part of the value', () => {
        expect(CliPreferenceEntry.parse('foo.expr="a=b"')).to.deep.equal({ preferenceName: 'foo.expr', value: 'a=b' });
    });

    it('decodes a base64-encoded value', () => {
        // base64 of the JSON value `42`
        expect(CliPreferenceEntry.parse('foo.num=base64:NDI=')).to.deep.equal({ preferenceName: 'foo.num', value: 42 });
    });

    it('splits an encoded language override into preferenceName and overrideIdentifier', () => {
        expect(CliPreferenceEntry.parse('[typescript].editor.tabSize=4')).to.deep.equal({
            preferenceName: 'editor.tabSize',
            value: 4,
            overrideIdentifier: 'typescript'
        });
    });

    it('keeps a nested-object [language] key as a literal preferenceName', () => {
        expect(CliPreferenceEntry.parse('[typescript]={"editor.tabSize":4}')).to.deep.equal({
            preferenceName: '[typescript]',
            value: { 'editor.tabSize': 4 }
        });
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
            expect(result).to.deep.equal([
                { preferenceName: 'a', value: 1 },
                { preferenceName: 'b', value: 'x' }
            ]);
        });
    });

    describe('encodedKey', () => {
        it('returns the plain preference name when there is no override', () => {
            expect(CliPreferenceEntry.encodedKey({ preferenceName: 'editor.fontSize', value: 14 })).to.equal('editor.fontSize');
        });

        it('re-encodes language overrides as [languageId].preferenceName', () => {
            expect(CliPreferenceEntry.encodedKey({
                preferenceName: 'editor.tabSize',
                value: 4,
                overrideIdentifier: 'typescript'
            })).to.equal('[typescript].editor.tabSize');
        });
    });

    describe('toArg', () => {
        it('formats an entry as a base64-encoded CLI argument', () => {
            // base64 of the JSON value `42`
            expect(CliPreferenceEntry.toArg('session-preference', { preferenceName: 'foo.num', value: 42 }))
                .to.equal('--session-preference=foo.num=base64:NDI=');
        });

        it('re-encodes language overrides in the CLI key', () => {
            const arg = CliPreferenceEntry.toArg('session-preference', {
                preferenceName: 'editor.tabSize',
                value: 4,
                overrideIdentifier: 'typescript'
            });
            expect(arg.startsWith('--session-preference=[typescript].editor.tabSize=base64:')).to.be.true;
        });

        it('round-trips a value with shell-special characters through toArg + parse', () => {
            const entry: CliPreference = { preferenceName: 'foo.expr', value: '$HOME && "quoted"' };
            const arg = CliPreferenceEntry.toArg('session-preference', entry);
            // The value part of `--session-preference=<value>` must parse back to the original entry.
            const value = arg.substring('--session-preference='.length);
            expect(CliPreferenceEntry.parse(value)).to.deep.equal(entry);
        });

        it('round-trips a language override through toArg + parse', () => {
            const entry: CliPreference = {
                preferenceName: 'editor.tabSize',
                value: 4,
                overrideIdentifier: 'typescript'
            };
            const arg = CliPreferenceEntry.toArg('session-preference', entry);
            const value = arg.substring('--session-preference='.length);
            expect(CliPreferenceEntry.parse(value)).to.deep.equal(entry);
        });
    });
});
