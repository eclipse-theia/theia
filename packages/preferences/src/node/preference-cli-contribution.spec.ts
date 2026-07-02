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
import { PreferenceCliContribution } from './preference-cli-contribution';

describe('PreferenceCliContribution', () => {

    let contribution: PreferenceCliContribution;

    beforeEach(() => {
        contribution = new PreferenceCliContribution();
    });

    describe('--set-preference', () => {
        it('parses a single key=value entry as JSON', async () => {
            contribution.setArguments({ setPreference: 'editor.fontSize=14' });
            expect(await contribution.getPreferences()).to.deep.equal([['editor.fontSize', 14]]);
            expect(await contribution.getSessionPreferences()).to.deep.equal([]);
        });

        it('parses string values quoted as JSON strings', async () => {
            contribution.setArguments({ setPreference: 'workbench.colorTheme="Dark+"' });
            expect(await contribution.getPreferences()).to.deep.equal([['workbench.colorTheme', 'Dark+']]);
        });

        it('parses object values', async () => {
            contribution.setArguments({ setPreference: 'ai-features.chat.toolConfirmation={"shellExecute":"always_allow"}' });
            expect(await contribution.getPreferences()).to.deep.equal([
                ['ai-features.chat.toolConfirmation', { shellExecute: 'always_allow' }]
            ]);
        });

        it('accepts an array of entries', async () => {
            contribution.setArguments({ setPreference: ['editor.fontSize=12', 'editor.tabSize=2'] });
            expect(await contribution.getPreferences()).to.deep.equal([
                ['editor.fontSize', 12],
                ['editor.tabSize', 2]
            ]);
        });

        it('decodes base64-prefixed JSON values', async () => {
            const json = JSON.stringify({ nested: true, n: 1 });
            const b64 = Buffer.from(json, 'utf-8').toString('base64');
            contribution.setArguments({ setPreference: `my.pref=base64:${b64}` });
            expect(await contribution.getPreferences()).to.deep.equal([
                ['my.pref', { nested: true, n: 1 }]
            ]);
        });

        it('preserves "=" characters inside the value', async () => {
            contribution.setArguments({ setPreference: 'my.pref="a=b=c"' });
            expect(await contribution.getPreferences()).to.deep.equal([['my.pref', 'a=b=c']]);
        });

        it('skips entries that do not contain "="', async () => {
            const originalWarn = console.warn;
            console.warn = () => { /* silence expected warning */ };
            try {
                contribution.setArguments({ setPreference: ['justAKey', 'editor.fontSize=14'] });
            } finally {
                console.warn = originalWarn;
            }
            expect(await contribution.getPreferences()).to.deep.equal([['editor.fontSize', 14]]);
        });

        it('skips entries whose value is not valid JSON', async () => {
            const originalWarn = console.warn;
            console.warn = () => { /* silence expected warning */ };
            try {
                contribution.setArguments({ setPreference: ['my.pref=notJson', 'editor.fontSize=14'] });
            } finally {
                console.warn = originalWarn;
            }
            expect(await contribution.getPreferences()).to.deep.equal([['editor.fontSize', 14]]);
        });
    });

    describe('--session-preference', () => {
        it('routes entries into the session preferences bucket', async () => {
            contribution.setArguments({ sessionPreference: 'ai-features.chat.defaultToolConfirmation="always_allow"' });
            expect(await contribution.getSessionPreferences()).to.deep.equal([
                ['ai-features.chat.defaultToolConfirmation', 'always_allow']
            ]);
            expect(await contribution.getPreferences()).to.deep.equal([]);
        });

        it('supports multiple session entries and base64', async () => {
            const b64 = Buffer.from('{"shellExecute":"always_allow"}', 'utf-8').toString('base64');
            contribution.setArguments({
                sessionPreference: [
                    'ai-features.chat.defaultToolConfirmation="always_allow"',
                    `ai-features.chat.toolConfirmation=base64:${b64}`
                ]
            });
            expect(await contribution.getSessionPreferences()).to.deep.equal([
                ['ai-features.chat.defaultToolConfirmation', 'always_allow'],
                ['ai-features.chat.toolConfirmation', { shellExecute: 'always_allow' }]
            ]);
        });

        it('keeps --set-preference and --session-preference independent', async () => {
            contribution.setArguments({
                setPreference: 'editor.fontSize=14',
                sessionPreference: 'editor.fontSize=20'
            });
            expect(await contribution.getPreferences()).to.deep.equal([['editor.fontSize', 14]]);
            expect(await contribution.getSessionPreferences()).to.deep.equal([['editor.fontSize', 20]]);
        });
    });

    describe('enhanceArgs (remote forwarding)', () => {
        it('returns an empty list when no session prefs are set', () => {
            expect(contribution.enhanceArgs()).to.deep.equal([]);
        });

        it('emits one base64-encoded --session-preference flag per entry', () => {
            contribution.setArguments({
                sessionPreference: [
                    'ai-features.chat.defaultToolConfirmation="always_allow"',
                    'ai-features.chat.toolConfirmation={"shellExecute":"always_allow"}'
                ]
            });
            const args = contribution.enhanceArgs();
            expect(args).to.have.lengthOf(2);
            for (const arg of args) {
                expect(arg.startsWith('--session-preference=')).to.be.true;
                const eq = arg.indexOf('=', '--session-preference='.length);
                const key = arg.substring('--session-preference='.length, eq);
                const rawValue = arg.substring(eq + 1);
                expect(rawValue.startsWith('base64:')).to.be.true;
                const decoded = JSON.parse(Buffer.from(rawValue.substring('base64:'.length), 'base64').toString('utf-8'));
                if (key === 'ai-features.chat.defaultToolConfirmation') {
                    expect(decoded).to.equal('always_allow');
                } else {
                    expect(decoded).to.deep.equal({ shellExecute: 'always_allow' });
                }
            }
        });

        it('does not forward --set-preference values', () => {
            contribution.setArguments({
                setPreference: 'editor.fontSize=14',
                sessionPreference: 'foo="bar"'
            });
            const args = contribution.enhanceArgs();
            expect(args).to.have.lengthOf(1);
            expect(args[0]).to.match(/^--session-preference=foo=base64:/);
        });
    });
});
