/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { enableJSDOM } from '../test/jsdom';

let disableJSDOM = enableJSDOM();
import { expect } from 'chai';
import { TabBarToolbarItem } from './tab-bar-toolbar';

disableJSDOM();

describe('tab-bar-toolbar', () => {

    describe('comparator', () => {

        before(() => {
            disableJSDOM = enableJSDOM();
        });

        after(() => {
            disableJSDOM();
        });

        const testMe = TabBarToolbarItem.PRIORITY_COMPARATOR;

        it("should favour the 'navigation' group before everything else", () => {
            expect(testMe({ id: 'a', command: 'a', group: 'navigation' }, { id: 'b', command: 'b', group: 'other' })).to.be.equal(-1);
        });

        it("should treat 'undefined' groups as 'navigation'", () => {
            expect(testMe({ id: 'a', command: 'a' }, { id: 'b', command: 'b' })).to.be.equal(0);
            expect(testMe({ id: 'a', command: 'a', group: 'navigation' }, { id: 'b', command: 'b' })).to.be.equal(0);
            expect(testMe({ id: 'a', command: 'a' }, { id: 'b', command: 'b', group: 'navigation' })).to.be.equal(0);
            expect(testMe({ id: 'a', command: 'a' }, { id: 'b', command: 'b', group: 'other' })).to.be.equal(-1);
        });

        it("should fall back to 'priority' if the groups are the same", () => {
            expect(testMe({ id: 'a', command: 'a', priority: 1 }, { id: 'b', command: 'b', priority: 2 })).to.be.equal(-1);
            expect(testMe({ id: 'a', command: 'a', group: 'navigation', priority: 1 }, { id: 'b', command: 'b', priority: 2 })).to.be.equal(-1);
            expect(testMe({ id: 'a', command: 'a', priority: 1 }, { id: 'b', command: 'b', group: 'navigation', priority: 2 })).to.be.equal(-1);
            expect(testMe({ id: 'a', command: 'a', priority: 1, group: 'other' }, { id: 'b', command: 'b', priority: 2 })).to.be.equal(1);
            expect(testMe({ id: 'a', command: 'a', group: 'other', priority: 1 }, { id: 'b', command: 'b', priority: 2, group: 'other' })).to.be.equal(-1);
            expect(testMe({ id: 'a', command: 'a', priority: 10 }, { id: 'b', command: 'b', group: 'other', priority: 2 })).to.be.equal(-1);
            expect(testMe({ id: 'a', command: 'a', group: 'other', priority: 10 }, { id: 'b', command: 'b', group: 'other', priority: 10 })).to.be.equal(0);
        });

    });

});
