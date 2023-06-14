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

import { expect } from 'chai';
import { DisposableCollection, Disposable } from './disposable';

describe('Disposables', () => {
    it('Is safe to use Disposable.NULL', () => {
        const collectionA = new DisposableCollection(Disposable.NULL);
        const collectionB = new DisposableCollection(Disposable.NULL);
        expect(!collectionA.disposed && !collectionB.disposed, 'Neither should be disposed before either is disposed.').to.be.true;
        collectionA.dispose();
        expect(collectionA.disposed, 'A should be disposed after being disposed.').to.be.true;
        expect(collectionB.disposed, 'B should not be disposed because A was disposed.').to.be.false;
    });
});
