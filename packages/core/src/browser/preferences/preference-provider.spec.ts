// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

import { PreferenceProvider } from './preference-provider';
const { expect } = require('chai');

describe('PreferenceProvider', () => {
    it('should preserve extra source fields on merge', () => {
        const result = PreferenceProvider.merge({ 'configurations': [], 'compounds': [] }, { 'configurations': [] });
        expect(result).deep.equals({ 'configurations': [], 'compounds': [] });
    });
    it('should preserve extra target fields on merge', () => {
        const result = PreferenceProvider.merge({ 'configurations': [] }, { 'configurations': [], 'compounds': [] });
        expect(result).deep.equals({ 'configurations': [], 'compounds': [] });
    });
    it('should merge array values', () => {
        const result = PreferenceProvider.merge(
            { 'configurations': [{ 'name': 'test1', 'request': 'launch' }], 'compounds': [] },
            { 'configurations': [{ 'name': 'test2' }] }
        );
        expect(result).deep.equals({ 'configurations': [{ 'name': 'test1', 'request': 'launch' }, { 'name': 'test2' }], 'compounds': [] });
    });
});
