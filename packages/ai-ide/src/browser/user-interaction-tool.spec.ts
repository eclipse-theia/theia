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
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { UserInteractionTool } from './user-interaction-tool';
import { WorkspaceFunctionScope } from './workspace-functions';
import { OpenerService } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { URI } from '@theia/core/lib/common/uri';

describe('UserInteractionTool', () => {
    let container: Container;
    let tool: UserInteractionTool;
    let mockOpenerService: sinon.SinonStubbedInstance<OpenerService>;
    let mockEditorManager: Partial<EditorManager>;
    let mockWorkspaceScope: Partial<WorkspaceFunctionScope>;
    let mockScmService: Partial<ScmService>;
    const workspaceRoot = new URI('file:///workspace');

    beforeEach(() => {
        container = new Container();

        mockWorkspaceScope = {
            getWorkspaceRoot: sinon.stub().resolves(workspaceRoot),
            ensureWithinWorkspace: sinon.stub()
        };

        mockOpenerService = {
            getOpeners: sinon.stub().resolves([]),
            getOpener: sinon.stub().resolves({
                open: sinon.stub().resolves(undefined)
            })
        } as unknown as sinon.SinonStubbedInstance<OpenerService>;

        mockEditorManager = {
            open: sinon.stub().resolves(undefined)
        };

        mockScmService = {
            selectedRepository: undefined
        };

        container.bind(WorkspaceFunctionScope).toConstantValue(mockWorkspaceScope as WorkspaceFunctionScope);
        container.bind(ScmService).toConstantValue(mockScmService as ScmService);
        container.bind(OpenerService).toConstantValue(mockOpenerService as unknown as OpenerService);
        container.bind(EditorManager).toConstantValue(mockEditorManager as EditorManager);
        container.bind(UserInteractionTool).toSelf();

        tool = container.get(UserInteractionTool);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should provide correct tool metadata', () => {
        const toolRequest = tool.getTool();
        expect(toolRequest.id).to.equal('userInteraction');
        expect(toolRequest.name).to.equal('userInteraction');
        expect(toolRequest.description).to.contain('interactive question');
        expect(toolRequest.parameters.required).to.deep.equal(['title', 'message', 'options']);
    });

    it('should return error when no tool call ID is available', async () => {
        const handler = tool.getTool().handler;
        const result = await handler(JSON.stringify({
            title: 'Test',
            message: 'Pick one',
            options: [{ text: 'A', value: 'a' }]
        }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.equal('No tool call ID available');
    });

    it('should return error when context has no toolCallId', async () => {
        const handler = tool.getTool().handler;
        const result = await handler(JSON.stringify({
            title: 'Test',
            message: 'Pick one',
            options: [{ text: 'A', value: 'a' }]
        }), {});

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.equal('No tool call ID available');
    });

    it('should wait for resolveInteraction and return selected value', async () => {
        const handler = tool.getTool().handler;
        const ctx = { toolCallId: 'call-1' };

        const handlerPromise = handler(JSON.stringify({
            title: 'Choose',
            message: 'Pick one',
            options: [{ text: 'A', value: 'a' }, { text: 'B', value: 'b' }]
        }), ctx);

        tool.resolveInteraction('call-1', 'b');

        const result = await handlerPromise;
        expect(result).to.equal('b');
    });

    it('should handle parallel calls independently', async () => {
        const handler = tool.getTool().handler;

        const promise1 = handler(JSON.stringify({
            title: 'Q1',
            message: 'Question 1',
            options: [{ text: 'A', value: 'a' }]
        }), { toolCallId: 'call-1' });

        const promise2 = handler(JSON.stringify({
            title: 'Q2',
            message: 'Question 2',
            options: [{ text: 'B', value: 'b' }]
        }), { toolCallId: 'call-2' });

        tool.resolveInteraction('call-2', 'b');
        const result2 = await promise2;
        expect(result2).to.equal('b');

        tool.resolveInteraction('call-1', 'a');
        const result1 = await promise1;
        expect(result1).to.equal('a');
    });

    it('should ignore resolveInteraction for unknown toolCallId', () => {
        // Should not throw
        tool.resolveInteraction('nonexistent-id', 'value');
    });

    it('should open a file link when autoOpen is not false', async () => {
        const handler = tool.getTool().handler;
        const ctx = { toolCallId: 'call-link-file' };

        const handlerPromise = handler(JSON.stringify({
            title: 'Review',
            message: 'Check this file',
            options: [{ text: 'OK', value: 'ok' }],
            link: { ref: { path: 'src/index.ts', line: 10 } }
        }), ctx);

        // Allow the async openLink to proceed
        await new Promise(resolve => setTimeout(resolve, 10));

        expect((mockEditorManager.open as sinon.SinonStub).calledOnce).to.be.true;
        const openCall = (mockEditorManager.open as sinon.SinonStub).getCall(0);
        expect(openCall.args[1]).to.deep.equal({ selection: { start: { line: 9, character: 0 } } });

        tool.resolveInteraction('call-link-file', 'ok');
        const result = await handlerPromise;
        expect(result).to.equal('ok');
    });

    it('should not open a file link when autoOpen is false', async () => {
        const handler = tool.getTool().handler;
        const ctx = { toolCallId: 'call-no-auto' };

        const handlerPromise = handler(JSON.stringify({
            title: 'Review',
            message: 'Check this file',
            options: [{ text: 'OK', value: 'ok' }],
            link: { ref: 'src/index.ts', autoOpen: false }
        }), ctx);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect((mockEditorManager.open as sinon.SinonStub).called).to.be.false;

        tool.resolveInteraction('call-no-auto', 'ok');
        await handlerPromise;
    });

    it('should open a diff link', async () => {
        const handler = tool.getTool().handler;
        const ctx = { toolCallId: 'call-link-diff' };

        const handlerPromise = handler(JSON.stringify({
            title: 'Review diff',
            message: 'Check these changes',
            options: [{ text: 'Accept', value: 'accept' }],
            link: { ref: 'src/old.ts', rightRef: 'src/new.ts' }
        }), ctx);

        await new Promise(resolve => setTimeout(resolve, 10));

        // The diff should go through openerService
        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.true;

        tool.resolveInteraction('call-link-diff', 'accept');
        const result = await handlerPromise;
        expect(result).to.equal('accept');
    });

    it('should not fail the interaction if link opening throws', async () => {
        (mockWorkspaceScope.ensureWithinWorkspace as sinon.SinonStub).throws(
            new Error('Access outside of the workspace is not allowed')
        );

        const handler = tool.getTool().handler;
        const ctx = { toolCallId: 'call-link-error' };

        const handlerPromise = handler(JSON.stringify({
            title: 'Review',
            message: 'Check this',
            options: [{ text: 'OK', value: 'ok' }],
            link: { ref: '../outside/file.ts' }
        }), ctx);

        await new Promise(resolve => setTimeout(resolve, 10));

        tool.resolveInteraction('call-link-error', 'ok');
        const result = await handlerPromise;
        expect(result).to.equal('ok');
    });

    it('should open a file link without line number', async () => {
        await tool.openLink({ ref: 'src/app.ts' });

        expect((mockEditorManager.open as sinon.SinonStub).calledOnce).to.be.true;
        const openCall = (mockEditorManager.open as sinon.SinonStub).getCall(0);
        expect(openCall.args[1]).to.deep.equal({ selection: undefined });
    });

    it('should open a diff link with custom label', async () => {
        await tool.openLink({ ref: 'src/old.ts', rightRef: 'src/new.ts', label: 'My Diff' });

        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.true;
    });

    it('should open multiple links when links array is provided', async () => {
        const handler = tool.getTool().handler;
        const ctx = { toolCallId: 'call-multi-links' };

        const handlerPromise = handler(JSON.stringify({
            title: 'Review',
            message: 'Check these files',
            options: [{ text: 'OK', value: 'ok' }],
            links: [
                { ref: { path: 'src/a.ts', line: 5 } },
                { ref: 'src/b.ts' }
            ]
        }), ctx);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect((mockEditorManager.open as sinon.SinonStub).callCount).to.equal(2);

        tool.resolveInteraction('call-multi-links', 'ok');
        const result = await handlerPromise;
        expect(result).to.equal('ok');
    });

    it('should not open links with autoOpen false in links array', async () => {
        const handler = tool.getTool().handler;
        const ctx = { toolCallId: 'call-mixed-auto' };

        const handlerPromise = handler(JSON.stringify({
            title: 'Review',
            message: 'Check these files',
            options: [{ text: 'OK', value: 'ok' }],
            links: [
                { ref: 'src/a.ts', autoOpen: true },
                { ref: 'src/b.ts', autoOpen: false }
            ]
        }), ctx);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect((mockEditorManager.open as sinon.SinonStub).callCount).to.equal(1);

        tool.resolveInteraction('call-mixed-auto', 'ok');
        await handlerPromise;
    });
});
