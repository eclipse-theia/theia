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

import * as assert from 'assert';
import { Container } from 'inversify';
import { createTreeContainer, isTreeServices } from './tree-container';
import { TreeSearch } from './tree-search';
import { defaultTreeProps, TreeProps } from './tree-widget';

describe('TreeContainer', () => {
    describe('IsTreeServices should accurately distinguish TreeProps from TreeContainerProps', () => {
        it('should assign search:boolean to TreeProps', () => {
            assert(isTreeServices({
                ...defaultTreeProps, search: true, multiSelect: true, globalSelection: true, contextMenuPath: ['so-contextual']
            }) === false);
        });
        it('should assign search:not-a-boolean to TreeContainerProps', () => {
            assert(isTreeServices({ search: TreeSearch }) === true);
        });
        const nonDefault = { search: !defaultTreeProps.search, contextMenu: ['no-default-for-this'] };
        it('should use props passed in as just props', () => {
            const parent = new Container();
            const child = createTreeContainer(parent, nonDefault);
            assert.deepStrictEqual(child.get(TreeProps), { ...defaultTreeProps, ...nonDefault });
        });
        it('should use props passed in as part of TreeContainerProps', () => {
            const parent = new Container();
            const child = createTreeContainer(parent, { props: nonDefault });
            assert.deepStrictEqual(child.get(TreeProps), { ...defaultTreeProps, ...nonDefault });
        });
    });
});
