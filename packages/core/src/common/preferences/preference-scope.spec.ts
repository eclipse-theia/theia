// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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
import { PreferenceScope } from './preference-scope';

describe('PreferenceScope', () => {

    it('getScopes() should return numbers from broadest to narrowest', () => {
        expect(PreferenceScope.getScopes()).deep.equal([0, 1, 2, 3]);
    });

    it('getReversedScopes() should return numbers from narrowest to broadest', () => {
        expect(PreferenceScope.getReversedScopes()).deep.equal([3, 2, 1, 0]);
    });

    it('getScopeNames() should return the names of scopes broader than the current one', () => {
        expect(PreferenceScope.getScopeNames(PreferenceScope.Workspace)).deep.equal(['Default', 'User', 'Workspace']);
    });

    it('is() returns whether a value is a preference scope', () => {
        expect(PreferenceScope.is(PreferenceScope.Default)).to.be.true;
        expect(PreferenceScope.is(PreferenceScope.User)).to.be.true;
        expect(PreferenceScope.is(PreferenceScope.Workspace)).to.be.true;
        expect(PreferenceScope.is(PreferenceScope.Folder)).to.be.true;
        expect(PreferenceScope.is(0)).to.be.true;
        expect(PreferenceScope.is(1)).to.be.true;
        expect(PreferenceScope.is(2)).to.be.true;
        expect(PreferenceScope.is(3)).to.be.true;
        expect(PreferenceScope.is(4)).to.be.false;
        expect(PreferenceScope.is(-1)).to.be.false;
        expect(PreferenceScope.is({})).to.be.false;
        expect(PreferenceScope.is('Default')).to.be.false;
    });
});
