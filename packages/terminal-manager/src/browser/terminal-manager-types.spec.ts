// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { TerminalManagerTreeTypes } from './terminal-manager-types';

describe('TerminalManagerTreeTypes', () => {
    after(() => {
        disableJSDOM();
    });

    describe('type guards', () => {
        it('isPageId should accept page- prefixed strings', () => {
            expect(TerminalManagerTreeTypes.isPageId('page-tasks')).to.be.true;
            expect(TerminalManagerTreeTypes.isPageId('page-debug')).to.be.true;
            expect(TerminalManagerTreeTypes.isPageId('page-123')).to.be.true;
        });

        it('isPageId should reject non-page strings', () => {
            expect(TerminalManagerTreeTypes.isPageId('terminal-123')).to.be.false;
            expect(TerminalManagerTreeTypes.isPageId('group-1')).to.be.false;
        });

        it('isPageNode should identify page nodes', () => {
            const node: TerminalManagerTreeTypes.PageNode = {
                page: true,
                id: 'page-123' as TerminalManagerTreeTypes.PageId,
                children: [],
                isEditing: false,
                label: 'Page',
                counter: 0,
                selected: false,
                parent: undefined,
                expanded: false
            };
            expect(TerminalManagerTreeTypes.isPageNode(node)).to.be.true;
        });

        it('isPageNode should reject non-page nodes', () => {
            expect(TerminalManagerTreeTypes.isPageNode(undefined)).to.be.false;
            expect(TerminalManagerTreeTypes.isPageNode({})).to.be.false;
            expect(TerminalManagerTreeTypes.isPageNode('page-tasks')).to.be.false;
        });

        it('isTerminalNode should identify terminal nodes', () => {
            const node: TerminalManagerTreeTypes.TerminalNode = {
                terminal: true,
                id: 'terminal-123' as TerminalManagerTreeTypes.TerminalKey,
                label: 'Terminal',
                isEditing: false,
                parentGroupId: 'group-1' as TerminalManagerTreeTypes.GroupId,
                selected: false,
                parent: undefined,
                children: []
            };
            expect(TerminalManagerTreeTypes.isTerminalNode(node)).to.be.true;
        });

        it('isGroupNode should identify group nodes', () => {
            const node: TerminalManagerTreeTypes.TerminalGroupNode = {
                terminalGroup: true,
                id: 'group-123' as TerminalManagerTreeTypes.GroupId,
                label: 'Group',
                isEditing: false,
                parentPageId: 'page-1' as TerminalManagerTreeTypes.PageId,
                counter: 0,
                children: [],
                selected: false,
                parent: undefined,
                expanded: false
            };
            expect(TerminalManagerTreeTypes.isGroupNode(node)).to.be.true;
        });
    });
});
