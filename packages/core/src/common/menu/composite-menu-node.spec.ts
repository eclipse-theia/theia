// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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
import { CompositeMenuNode } from './composite-menu-node';
import { CompoundMenuNodeRole } from './menu-types';

describe('composite-menu-node', () => {
    describe('updateOptions', () => {
        it('should update undefined node properties', () => {
            const node = new CompositeMenuNode('test-id');
            node.updateOptions({ label: 'node-label', icon: 'icon', order: 'a', role: CompoundMenuNodeRole.Flat, when: 'node-condition' });
            expect(node.label).to.equal('node-label');
            expect(node.icon).to.equal('icon');
            expect(node.order).to.equal('a');
            expect(node.role).to.equal(CompoundMenuNodeRole.Flat);
            expect(node.when).to.equal('node-condition');
        });
        it('should update existing node properties', () => {
            const node = new CompositeMenuNode('test-id', 'test-label', { icon: 'test-icon', order: 'a1', role: CompoundMenuNodeRole.Submenu, when: 'test-condition' });
            node.updateOptions({ label: 'NEW-label', icon: 'NEW-icon', order: 'a2', role: CompoundMenuNodeRole.Flat, when: 'NEW-condition' });
            expect(node.label).to.equal('NEW-label');
            expect(node.icon).to.equal('NEW-icon');
            expect(node.order).to.equal('a2');
            expect(node.role).to.equal(CompoundMenuNodeRole.Flat);
            expect(node.when).to.equal('NEW-condition');
        });
        it('should update only the icon without affecting other properties', () => {
            const node = new CompositeMenuNode('test-id', 'test-label', { icon: 'test-icon', order: 'a' });
            node.updateOptions({ icon: 'NEW-icon' });
            expect(node.label).to.equal('test-label');
            expect(node.icon).to.equal('NEW-icon');
            expect(node.order).to.equal('a');
        });
        it('should not allow to unset properties', () => {
            const node = new CompositeMenuNode('test-id', 'test-label', { icon: 'test-icon', order: 'a' });
            node.updateOptions({ icon: undefined });
            expect(node.label).to.equal('test-label');
            expect(node.icon).to.equal('test-icon');
            expect(node.order).to.equal('a');
        });
        it('should allow to set empty strings in properties', () => {
            const node = new CompositeMenuNode('test-id', 'test-label');
            node.updateOptions({ label: '' });
            expect(node.label).to.equal('');
        });
        it('should not cause side effects when updating a property to its existing value', () => {
            const node = new CompositeMenuNode('test-id', 'test-label', { icon: 'test-icon', order: 'a' });
            node.updateOptions({ icon: 'test-icon' });
            expect(node.label).to.equal('test-label');
            expect(node.icon).to.equal('test-icon');
            expect(node.order).to.equal('a');
        });
    });
});
