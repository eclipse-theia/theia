// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { parseModule } from './utility';
import { expect } from 'chai';

describe('@theia/re-exports/lib/utility.js', () => {

    it('parseModule', () => {
        expect(parseModule('a')).length(1).members(['a']);
        expect(parseModule('a/')).length(1).members(['a']);
        expect(parseModule('a/b')).length(2).members(['a', 'b']);
        expect(parseModule('a/b/')).length(2).members(['a', 'b']);
        expect(parseModule('a/b/c/d/e/f')).length(2).members(['a', 'b/c/d/e/f']);
    });

    it('parseModule with namespaced package', () => {
        expect(parseModule('@a/b')).length(1).members(['@a/b']);
        expect(parseModule('@a/b/')).length(1).members(['@a/b']);
        expect(parseModule('@a/b/c')).length(2).members(['@a/b', 'c']);
        expect(parseModule('@a/b/c/')).length(2).members(['@a/b', 'c']);
        expect(parseModule('@a/b/c/d/e/f')).length(2).members(['@a/b', 'c/d/e/f']);
    });

    it('parseModule unexpected module name/format', () => {
        expect(() => parseModule('@a')).throw();
    });
});
