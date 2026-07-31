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
import { LaunchArgsStore } from './launch-args-store';

describe('LaunchArgsStore', () => {

    it('redeems the stored argv for its launch id', () => {
        const store = new LaunchArgsStore();
        const argv = ['--attach-container', 'B', '--session-preference', 'foo=1'];
        const id = store.store(argv);
        expect(store.redeem(id)).to.deep.equal(argv);
    });

    it('is one-shot: a second redemption of the same id yields an empty array', () => {
        const store = new LaunchArgsStore();
        const id = store.store(['--attach-container', 'B']);
        store.redeem(id);
        expect(store.redeem(id)).to.deep.equal([]);
    });

    it('returns an empty array for an unknown id', () => {
        const store = new LaunchArgsStore();
        expect(store.redeem('does-not-exist')).to.deep.equal([]);
    });

    it('keeps entries independent and hands out distinct ids', () => {
        const store = new LaunchArgsStore();
        const idA = store.store(['A']);
        const idB = store.store(['B']);
        expect(idA).to.not.equal(idB);
        expect(store.redeem(idB)).to.deep.equal(['B']);
        expect(store.redeem(idA)).to.deep.equal(['A']);
    });
});
