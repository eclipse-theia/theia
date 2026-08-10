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

    it('returns the stored argv for its window id', () => {
        const store = new LaunchArgsStore();
        const argv = ['--attach-container', 'B', '--session-preference', 'foo=1'];
        store.store(1, argv);
        expect(store.get(1)).to.deep.equal(argv);
    });

    it('keeps the argv for the window lifetime, so a reload still sees it', () => {
        const store = new LaunchArgsStore();
        store.store(1, ['--attach-container', 'B']);
        expect(store.get(1)).to.deep.equal(['--attach-container', 'B']);
        // a second read (e.g. after a reload) still returns the arguments
        expect(store.get(1)).to.deep.equal(['--attach-container', 'B']);
    });

    it('returns undefined for an unknown (cold-start) window id', () => {
        const store = new LaunchArgsStore();
        expect(store.get(42)).to.equal(undefined);
    });

    it('drops the argv once the window is deleted', () => {
        const store = new LaunchArgsStore();
        store.store(1, ['A']);
        store.delete(1);
        expect(store.get(1)).to.equal(undefined);
    });

    it('keeps entries independent per window id', () => {
        const store = new LaunchArgsStore();
        store.store(1, ['A']);
        store.store(2, ['B']);
        expect(store.get(2)).to.deep.equal(['B']);
        expect(store.get(1)).to.deep.equal(['A']);
    });
});
