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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { Container, interfaces } from 'inversify';
import { collectRecursive } from './inversify-utils';

describe('Inversify Utilities', () => {

    it('collectRecursive should not lead to duplicates', () => {
        const identifier = 'test' as string & interfaces.Abstract<number>;
        const parent = new Container();
        parent.bind(identifier).toConstantValue(1);
        const child = parent.createChild();
        expect(collectRecursive(child, container => container.isBound(identifier), container => container.getAll(identifier)))
            .members([1], 'We should not get duplicates!');
        expect(child.parent)
            .equal(parent, 'The parent should be restored!');
        expect(child.getAll(identifier))
            .members([1], 'Somehow the child container did not bubble the request to its parent!');
    });
});
