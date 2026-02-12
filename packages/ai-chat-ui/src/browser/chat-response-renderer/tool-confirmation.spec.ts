// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { ContextMenuRenderer } from '@theia/core/lib/browser';
import { ConfirmationScope, ToolConfirmationCallbacks, ToolConfirmationActionsProps, ToolConfirmationProps } from './tool-confirmation';

const mockContextMenuRenderer = {} as ContextMenuRenderer;

describe('Tool Confirmation Types', () => {
    describe('ConfirmationScope', () => {
        it('should accept valid scopes', () => {
            const scopes: ConfirmationScope[] = ['once', 'session', 'forever'];
            expect(scopes).to.have.length(3);
        });
    });

    describe('ToolConfirmationCallbacks', () => {
        it('should define required callback properties', () => {
            const callbacks: ToolConfirmationCallbacks = {
                onAllow: (_scope: ConfirmationScope) => { },
                onDeny: (_scope: ConfirmationScope, _reason?: string) => { }
            };
            expect(callbacks.onAllow).to.be.a('function');
            expect(callbacks.onDeny).to.be.a('function');
        });

        it('should allow optional toolRequest', () => {
            const callbacks: ToolConfirmationCallbacks = {
                toolRequest: { id: 'test', name: 'test', handler: async () => '', parameters: { type: 'object', properties: {} } },
                onAllow: () => { },
                onDeny: () => { }
            };
            expect(callbacks.toolRequest).to.exist;
        });
    });

    describe('ToolConfirmationActionsProps', () => {
        it('should extend ToolConfirmationCallbacks with toolName', () => {
            const props: ToolConfirmationActionsProps = {
                toolName: 'testTool',
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer
            };
            expect(props.toolName).to.equal('testTool');
        });

        it('should support confirmAlwaysAllow string in toolRequest', () => {
            const props: ToolConfirmationActionsProps = {
                toolName: 'dangerousTool',
                toolRequest: {
                    id: 'test',
                    name: 'test',
                    handler: async () => '',
                    parameters: { type: 'object', properties: {} },
                    confirmAlwaysAllow: 'This tool can modify system files.'
                },
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer
            };
            expect(props.toolRequest?.confirmAlwaysAllow).to.equal('This tool can modify system files.');
        });

        it('should support confirmAlwaysAllow boolean in toolRequest', () => {
            const props: ToolConfirmationActionsProps = {
                toolName: 'dangerousTool',
                toolRequest: {
                    id: 'test',
                    name: 'test',
                    handler: async () => '',
                    parameters: { type: 'object', properties: {} },
                    confirmAlwaysAllow: true
                },
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer
            };
            expect(props.toolRequest?.confirmAlwaysAllow).to.be.true;
        });
    });

    describe('ToolConfirmationProps', () => {
        it('should pick toolRequest from ToolConfirmationCallbacks', () => {
            const props: ToolConfirmationProps = {
                response: { kind: 'toolCall', id: 'test', name: 'test' } as ToolConfirmationProps['response'],
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer
            };
            expect(props.toolRequest).to.be.undefined;
        });
    });
});
