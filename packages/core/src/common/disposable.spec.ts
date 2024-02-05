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

import { expect, spy, use } from 'chai';
import { DisposableCollection, Disposable } from './disposable';
import * as spies from 'chai-spies';

use(spies);

describe('Disposables', () => {
    it('Is safe to use Disposable.NULL', () => {
        const collectionA = new DisposableCollection(Disposable.NULL);
        const collectionB = new DisposableCollection(Disposable.NULL);
        expect(!collectionA.disposed && !collectionB.disposed, 'Neither should be disposed before either is disposed.').to.be.true;
        collectionA.dispose();
        expect(collectionA.disposed, 'A should be disposed after being disposed.').to.be.true;
        expect(collectionB.disposed, 'B should not be disposed because A was disposed.').to.be.false;
    });

    it('Collection is auto-pruned when an element is disposed', () => {
        const onDispose = spy(() => { });
        const elementDispose = () => { };

        const collection = new DisposableCollection();
        collection.onDispose(onDispose);

        const disposable1 = Disposable.create(elementDispose);
        collection.push(disposable1);
        expect(collection['disposables']).to.have.lengthOf(1);

        const disposable2 = Disposable.create(elementDispose);
        collection.push(disposable2);
        expect(collection['disposables']).to.have.lengthOf(2);

        disposable1.dispose();
        expect(collection['disposables']).to.have.lengthOf(1);
        expect(onDispose).to.have.not.been.called();
        expect(collection.disposed).is.false;

        // Test that calling dispose on an already disposed element doesn't
        // alter the collection state
        disposable1.dispose();
        expect(collection['disposables']).to.have.lengthOf(1);
        expect(onDispose).to.have.not.been.called();
        expect(collection.disposed).is.false;

        disposable2.dispose();
        expect(collection['disposables']).to.be.empty;
        expect(collection.disposed).is.true;
        expect(onDispose).to.have.been.called.once;
    });

    it('onDispose is only called once on actual disposal of elements', () => {
        const onDispose = spy(() => { });
        const elementDispose = spy(() => { });

        const collection = new DisposableCollection();
        collection.onDispose(onDispose);

        // if the collection is empty 'onDispose' is not called
        collection.dispose();
        expect(onDispose).to.not.have.been.called();

        // 'onDispose' is called because we actually dispose an element
        collection.push(Disposable.create(elementDispose));
        collection.dispose();
        expect(elementDispose).to.have.been.called.once;
        expect(onDispose).to.have.been.called.once;

        // if the collection is empty 'onDispose' is not called and no further element is disposed
        collection.dispose();
        expect(elementDispose).to.have.been.called.once;
        expect(onDispose).to.have.been.called.once;

        // 'onDispose' is not called again even if we actually dispose an element
        collection.push(Disposable.create(elementDispose));
        collection.dispose();
        expect(elementDispose).to.have.been.called.twice;
        expect(onDispose).to.have.been.called.once;
    });
});
