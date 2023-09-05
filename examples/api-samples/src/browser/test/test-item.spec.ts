// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import * as chai from 'chai';
import { TestItemImpl } from './test-controller';
import { URI } from '@theia/core';
import { DeltaKind, TreeDeltaBuilderImpl } from '@theia/test/lib/common/tree-delta';

const expect = chai.expect;

describe('TestItem tests', () => {
    it('should notify property changes', () => {
        const deltaBuilder = new TreeDeltaBuilderImpl<string, TestItemImpl>();
        const item = new TestItemImpl(new URI('https://foo/bar'), 'b');
        item._deltaBuilder = deltaBuilder;
        item._path = ['a', 'b'];
        item.label = 'theLabel';
        const range = { start: { line: 17, character: 5 }, end: { line: 17, character: 37 } };
        item.range = range;
        expect(deltaBuilder.currentDelta).deep.equal([{
            path: ['a', 'b'],
            type: DeltaKind.CHANGED,
            value: {
                label: 'theLabel',
                range: range
            },
        }]);
    });
});
