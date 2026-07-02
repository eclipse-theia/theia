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
import { SessionPreferenceProvider } from './session-preference-provider';
import { PreferenceScope } from './preference-scope';

describe('SessionPreferenceProvider', () => {

    let provider: SessionPreferenceProvider;

    beforeEach(() => {
        provider = new SessionPreferenceProvider();
        // PostConstruct emulation
        (provider as unknown as { init(): void }).init();
    });

    it('claims only the Session scope', () => {
        expect(provider.canHandleScope(PreferenceScope.Session)).to.be.true;
        expect(provider.canHandleScope(PreferenceScope.User)).to.be.false;
        expect(provider.canHandleScope(PreferenceScope.Workspace)).to.be.false;
        expect(provider.canHandleScope(PreferenceScope.Folder)).to.be.false;
        expect(provider.canHandleScope(PreferenceScope.Default)).to.be.false;
    });

    it('starts empty', () => {
        expect(provider.getPreferences()).to.deep.equal({});
    });

    it('stores set values in memory and exposes them via get/resolve', async () => {
        const ok = await provider.setPreference('editor.fontSize', 18);
        expect(ok).to.be.true;
        expect(provider.get('editor.fontSize')).to.equal(18);
        expect(provider.resolve('editor.fontSize').value).to.equal(18);
        expect(provider.getPreferences()).to.deep.equal({ 'editor.fontSize': 18 });
    });

    it('emits a change event on set', async () => {
        let received: { name: string; newValue: unknown; oldValue: unknown; scope: PreferenceScope } | undefined;
        provider.onDidPreferencesChanged(changes => {
            const key = Object.keys(changes)[0];
            received = {
                name: changes[key].preferenceName,
                newValue: changes[key].newValue,
                oldValue: changes[key].oldValue,
                scope: changes[key].scope
            };
        });
        await provider.setPreference('foo', 'bar');
        expect(received).to.deep.equal({ name: 'foo', newValue: 'bar', oldValue: undefined, scope: PreferenceScope.Session });
    });

    it('removes a value when set to undefined', async () => {
        await provider.setPreference('foo', 'bar');
        const removed = await provider.setPreference('foo', undefined as never);
        expect(removed).to.be.true;
        expect(provider.get('foo')).to.equal(undefined);
        expect(provider.getPreferences()).to.deep.equal({});
    });

    it('returns false when removing a key that was never set', async () => {
        const removed = await provider.setPreference('missing', undefined as never);
        expect(removed).to.be.false;
    });
});
