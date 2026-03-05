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
import { TerminalManagerTreeTypes, TASKS_PAGE_ID, isTasksPageNode } from './terminal-manager-types';

describe('TerminalManagerTreeTypes', () => {
    after(() => {
        disableJSDOM();
    });

    describe('TASKS_PAGE_ID', () => {
        it('should have the correct value', () => {
            expect(TASKS_PAGE_ID).to.equal('page-tasks');
        });

        it('should be a valid PageId', () => {
            expect(TerminalManagerTreeTypes.isPageId(TASKS_PAGE_ID)).to.be.true;
        });
    });

    describe('isTasksPageNode', () => {
        it('should return true for a page node with TASKS_PAGE_ID', () => {
            const node: TerminalManagerTreeTypes.PageNode = {
                page: true,
                id: TASKS_PAGE_ID,
                children: [],
                isEditing: false,
                label: 'Tasks',
                counter: 0,
                selected: false,
                parent: undefined,
                expanded: false
            };
            expect(isTasksPageNode(node)).to.be.true;
        });

        it('should return false for a regular page node', () => {
            const node: TerminalManagerTreeTypes.PageNode = {
                page: true,
                id: 'page-123' as TerminalManagerTreeTypes.PageId,
                children: [],
                isEditing: false,
                label: 'Regular Page',
                counter: 1,
                selected: false,
                parent: undefined,
                expanded: false
            };
            expect(isTasksPageNode(node)).to.be.false;
        });

        it('should return false for non-page nodes', () => {
            expect(isTasksPageNode(undefined)).to.be.false;
            expect(isTasksPageNode({})).to.be.false;
            expect(isTasksPageNode('page-tasks')).to.be.false;
        });

        it('should return false for terminal nodes', () => {
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
            expect(isTasksPageNode(node)).to.be.false;
        });

        it('should return false for group nodes', () => {
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
            expect(isTasksPageNode(node)).to.be.false;
        });
    });
});
