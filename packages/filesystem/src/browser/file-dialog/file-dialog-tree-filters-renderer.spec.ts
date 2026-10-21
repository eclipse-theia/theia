// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { FileDialogTree } from './file-dialog-tree.js';
import { FileDialogTreeFiltersRenderer } from './file-dialog-tree-filters-renderer.js';

disableJSDOM();

describe('FileDialogTreeFiltersRenderer', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    const suppliedFilters = { 'Theia Workspace': ['theia-workspace'] };
    const fileDialogTree = {} as FileDialogTree;

    it('offers the supplied filters followed by All Files', () => {
        const renderer = new FileDialogTreeFiltersRenderer({ suppliedFilters, fileDialogTree });
        expect(Object.keys(renderer.appliedFilters)).to.deep.equal(['Theia Workspace', 'All Files']);
    });

    it('offers only the supplied filters if All Files is disabled', () => {
        const renderer = new FileDialogTreeFiltersRenderer({ suppliedFilters, fileDialogTree, disableAllFilesFilter: true });
        expect(Object.keys(renderer.appliedFilters)).to.deep.equal(['Theia Workspace']);
    });
});
