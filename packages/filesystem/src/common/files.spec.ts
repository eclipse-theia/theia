// *****************************************************************************
// Copyright (C) 2022 Texas Instruments and others.
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

import { FileChangesEvent, FileChangeType } from './files';
import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';

describe('FileChangesEvent', () => {
    it('deleting parent folder - event contains child', () => {
        const parent = new URI('file:///grandparent/parent');
        const child = new URI('file:///grandparent/parent/child');
        const event = new FileChangesEvent([{ resource: parent, type: FileChangeType.DELETED }]);
        expect(event.contains(child, FileChangeType.DELETED)).to.eq(true);
    });
    it('deleting grandparent folder - event contains grandchild', () => {
        const grandparent = new URI('file:///grandparent');
        const grandchild = new URI('file:///grandparent/parent/child');
        const event = new FileChangesEvent([{ resource: grandparent, type: FileChangeType.DELETED }]);
        expect(event.contains(grandchild, FileChangeType.DELETED)).to.eq(true);
    });
    it('deleting child file - event does not contain parent', () => {
        const parent = new URI('file:///grandparent/parent');
        const child = new URI('file:///grandparent/parent/child');
        const event = new FileChangesEvent([{ resource: child, type: FileChangeType.DELETED }]);
        expect(event.contains(parent, FileChangeType.DELETED)).to.eq(false);
    });
    it('deleting grandchild file - event does not contain grandchild', () => {
        const grandparent = new URI('file:///grandparent');
        const grandchild = new URI('file:///grandparent/parent/child');
        const event = new FileChangesEvent([{ resource: grandchild, type: FileChangeType.DELETED }]);
        expect(event.contains(grandparent, FileChangeType.DELETED)).to.eq(false);
    });
    it('deleting self - event contains self', () => {
        const self = new URI('file:///grandparent/parent/self');
        const event = new FileChangesEvent([{ resource: self, type: FileChangeType.DELETED }]);
        expect(event.contains(self, FileChangeType.DELETED)).to.eq(true);
    });
});
