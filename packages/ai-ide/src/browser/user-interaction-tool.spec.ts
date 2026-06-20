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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { UserInteractionTool } from './user-interaction-tool';
import { UserInteractionResult } from '../common/user-interaction-tool';
import { WorkspaceFunctionScope } from './workspace-functions';
import { OpenerService } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { URI } from '@theia/core/lib/common/uri';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { MEMORY_TEXT, MEMORY_TEXT_READONLY, ResourceProvider } from '@theia/core/lib/common/resource';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';

disableJSDOM();

const singleStepArgs = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    interactions: [{
        title: 'Choose',
        message: 'Pick one',
        options: [{ text: 'A', value: 'a' }, { text: 'B', value: 'b' }],
        ...overrides
    }]
});

const parseResult = (raw: unknown): UserInteractionResult => JSON.parse(raw as string);

const makeMockRepo = () => ({
    provider: { id: 'git', rootUri: 'file:///workspace' },
    toUriAtRef: (fileUri: URI, ref: string) =>
        fileUri.withScheme('git').withQuery(JSON.stringify({ path: fileUri.path.fsPath(), ref }))
});

describe('UserInteractionTool', () => {
    let container: Container;
    let tool: UserInteractionTool;
    let mockOpenerService: sinon.SinonStubbedInstance<OpenerService>;
    let mockEditorManager: Partial<EditorManager>;
    let mockWorkspaceScope: Partial<WorkspaceFunctionScope>;
    let mockScmService: Partial<ScmService>;
    let mockResourceProvider: sinon.SinonStub;
    const workspaceRoot = new URI('file:///workspace');

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();

        mockWorkspaceScope = {
            resolveRelativePath: sinon.stub().callsFake((path: string) => workspaceRoot.resolve(path)),
            getContainingRoot: sinon.stub().returns(workspaceRoot),
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
            findRepository: sinon.stub().returns(undefined)
        };

        mockResourceProvider = sinon.stub().callsFake(async (uri: URI) => ({
            uri,
            readContents: sinon.stub().resolves(''),
            dispose: sinon.stub()
        }));

        container.bind(WorkspaceFunctionScope).toConstantValue(mockWorkspaceScope as WorkspaceFunctionScope);
        container.bind(ScmService).toConstantValue(mockScmService as ScmService);
        container.bind(OpenerService).toConstantValue(mockOpenerService as unknown as OpenerService);
        container.bind(EditorManager).toConstantValue(mockEditorManager as EditorManager);
        container.bind(ResourceProvider).toConstantValue(mockResourceProvider as unknown as ResourceProvider);
        container.bind(UserInteractionTool).toSelf();

        tool = container.get(UserInteractionTool);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return error when no interactions are provided', async () => {
        const handler = tool.getTool().handler;
        const result = await handler(JSON.stringify({ interactions: [] }), { toolCallId: 'x' });
        expect(JSON.parse(result as string).error).to.equal('No interactions provided');
    });

    it('should return error when arguments are invalid JSON', async () => {
        const handler = tool.getTool().handler;
        const result = await handler('not-json', { toolCallId: 'x' });
        expect(JSON.parse(result as string).error).to.equal('Invalid arguments');
    });

    it('should return error when no tool call ID is available', async () => {
        const handler = tool.getTool().handler;
        const result = await handler(singleStepArgs(), undefined);
        expect(JSON.parse(result as string).error).to.equal('No tool call ID available');
    });

    it('should resolve the handler with the result passed to completeInteraction', async () => {
        const handler = tool.getTool().handler;
        const handlerPromise = handler(singleStepArgs(), { toolCallId: 'call-1' });

        tool.completeInteraction('call-1', {
            completed: true,
            steps: [{ title: 'Choose', value: 'b' }]
        });

        const result = parseResult(await handlerPromise);
        expect(result.completed).to.be.true;
        expect(result.steps).to.have.length(1);
        expect(result.steps[0]).to.deep.equal({ title: 'Choose', value: 'b' });
    });

    it('should forward multi-step results verbatim', async () => {
        const handler = tool.getTool().handler;
        const args = JSON.stringify({
            interactions: [
                { title: 'Overview', message: 'summary' },
                { title: 'Area 1', message: 'finding', options: [{ text: 'OK', value: 'approve' }] },
                { title: 'Area 2', message: 'no findings' }
            ]
        });
        const handlerPromise = handler(args, { toolCallId: 'call-multi' });

        tool.completeInteraction('call-multi', {
            completed: true,
            steps: [
                { title: 'Overview', comments: ['nice summary'] },
                { title: 'Area 1', value: 'approve', comments: ['fix on line 42'] },
                { title: 'Area 2' }
            ]
        });

        const result = parseResult(await handlerPromise);
        expect(result.completed).to.be.true;
        expect(result.steps).to.have.length(3);
        expect(result.steps[0]).to.deep.equal({ title: 'Overview', comments: ['nice summary'] });
        expect(result.steps[1]).to.deep.equal({ title: 'Area 1', value: 'approve', comments: ['fix on line 42'] });
        expect(result.steps[2]).to.deep.equal({ title: 'Area 2' });
    });

    it('should ignore completeInteraction calls after the interaction resolved', async () => {
        const handler = tool.getTool().handler;
        const handlerPromise = handler(singleStepArgs(), { toolCallId: 'call-late' });
        tool.completeInteraction('call-late', {
            completed: true,
            steps: [{ title: 'Choose', value: 'a' }]
        });
        const result = parseResult(await handlerPromise);
        expect(result.steps[0].value).to.equal('a');
        // Late call must not throw or change anything
        tool.completeInteraction('call-late', {
            completed: true,
            steps: [{ title: 'Choose', value: 'b' }]
        });
        // No assertion needed beyond ensuring no exception
    });

    it('should resolve with the renderer-supplied partial on cancellation', async () => {
        const handler = tool.getTool().handler;
        const cts = new CancellationTokenSource();
        const args = JSON.stringify({
            interactions: [
                { title: 'Step A', message: 'm' },
                { title: 'Step B', message: 'm' },
                { title: 'Step C', message: 'm' }
            ]
        });
        const handlerPromise = handler(args, { toolCallId: 'call-cancel', cancellationToken: cts.token });

        // Wait a microtask so the handler has registered the pending interaction.
        await Promise.resolve();
        // Simulate the renderer pushing the latest partial state.
        tool.recordPartial('call-cancel', {
            completed: false,
            steps: [
                { title: 'Step A', comments: ['first done'] },
                { title: 'Step B', value: 'whatever' },
                { title: 'Step C', skipped: true }
            ]
        });
        cts.cancel();

        const result = parseResult(await handlerPromise);
        expect(result.completed).to.be.false;
        expect(result.steps[0]).to.deep.equal({ title: 'Step A', comments: ['first done'] });
        expect(result.steps[1]).to.deep.equal({ title: 'Step B', value: 'whatever' });
        expect(result.steps[2].skipped).to.be.true;
    });

    it('should fall back to all-skipped when no renderer claims the cancellation', async () => {
        const handler = tool.getTool().handler;
        const cts = new CancellationTokenSource();
        const args = JSON.stringify({
            interactions: [
                { title: 'Step A', message: 'm' },
                { title: 'Step B', message: 'm' }
            ]
        });
        const handlerPromise = handler(args, { toolCallId: 'call-skip-all', cancellationToken: cts.token });
        cts.cancel();
        const result = parseResult(await handlerPromise);
        expect(result.completed).to.be.false;
        expect(result.steps.every(s => s.skipped)).to.be.true;
    });

    it('should handle parallel calls independently', async () => {
        const handler = tool.getTool().handler;

        const promise1 = handler(JSON.stringify({
            interactions: [{ title: 'Q1', message: 'first', options: [{ text: 'A', value: 'a' }] }]
        }), { toolCallId: 'call-p1' });

        const promise2 = handler(JSON.stringify({
            interactions: [{ title: 'Q2', message: 'second', options: [{ text: 'B', value: 'b' }] }]
        }), { toolCallId: 'call-p2' });

        tool.completeInteraction('call-p2', { completed: true, steps: [{ title: 'Q2', value: 'b' }] });
        tool.completeInteraction('call-p1', { completed: true, steps: [{ title: 'Q1', value: 'a' }] });

        expect(parseResult(await promise1).steps[0].value).to.equal('a');
        expect(parseResult(await promise2).steps[0].value).to.equal('b');
    });

    it('should open a file link via openLink helper', async () => {
        await tool.openLink({ ref: { path: 'src/index.ts', line: 10 } });

        expect((mockEditorManager.open as sinon.SinonStub).calledOnce).to.be.true;
        const openCall = (mockEditorManager.open as sinon.SinonStub).getCall(0);
        expect(openCall.args[1]).to.deep.equal({ selection: { start: { line: 9, character: 0 } } });
    });

    it('should open a file link without line number', async () => {
        await tool.openLink({ ref: 'src/app.ts' });

        expect((mockEditorManager.open as sinon.SinonStub).calledOnce).to.be.true;
        const openCall = (mockEditorManager.open as sinon.SinonStub).getCall(0);
        expect(openCall.args[1]).to.deep.equal({ selection: undefined });
    });

    it('should open a file link when rightRef is an invalid placeholder', async () => {
        await tool.openLink({
            ref: { path: 'README.md', line: 1 },
            rightRef: { path: '' }
        });

        expect((mockEditorManager.open as sinon.SinonStub).calledOnce).to.be.true;
        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.false;
        const openCall = (mockEditorManager.open as sinon.SinonStub).getCall(0);
        expect(openCall.args[0].toString()).to.equal('file:///workspace/README.md');
        expect(openCall.args[1]).to.deep.equal({ selection: { start: { line: 0, character: 0 } } });
    });

    it('should open a diff link with custom label', async () => {
        await tool.openLink({ ref: 'src/old.ts', rightRef: 'src/new.ts', label: 'My Diff' });
        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.true;
    });

    it('should forward right-side line as selection when opening a diff', async () => {
        await tool.openLink({ ref: 'src/foo.ts', rightRef: { path: 'src/foo.ts', line: 42 } });
        const getOpenerCall = (mockOpenerService.getOpener as sinon.SinonStub).getCall(0);
        expect(getOpenerCall.args[1]).to.deep.equal({ selection: { start: { line: 41, character: 0 } } });
    });

    it('should fall back to left-side line when right side has none', async () => {
        await tool.openLink({ ref: { path: 'src/foo.ts', line: 7 }, rightRef: 'src/foo.ts' });
        const getOpenerCall = (mockOpenerService.getOpener as sinon.SinonStub).getCall(0);
        expect(getOpenerCall.args[1]).to.deep.equal({ selection: { start: { line: 6, character: 0 } } });
    });

    it('should treat new files (content unreadable at gitRef) as empty rather than an error', async () => {
        mockResourceProvider.callsFake(async (uri: URI) => {
            if (uri.scheme === 'git') {
                return {
                    uri,
                    readContents: sinon.stub().rejects(new Error('file not found at ref')),
                    dispose: sinon.stub()
                };
            }
            return {
                uri,
                readContents: sinon.stub().resolves('content'),
                dispose: sinon.stub()
            };
        });

        (mockScmService.findRepository as sinon.SinonStub).returns(makeMockRepo());

        await tool.openLink({
            ref: { path: 'src/new-file.ts', gitRef: 'abc123' },
            rightRef: 'src/new-file.ts'
        });

        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.true;
        const openCall = (mockOpenerService.getOpener as sinon.SinonStub).getCall(0);
        const diffUri = openCall.args[0] as URI;
        expect(DiffUris.isDiffUri(diffUri)).to.be.true;
        const [leftUri] = DiffUris.decode(diffUri);
        expect(leftUri.scheme).to.equal(MEMORY_TEXT);
    });

    it('should open diff with empty right side when right-side cannot be resolved', async () => {
        mockResourceProvider.callsFake(async (uri: URI) => {
            if (uri.scheme === 'file') {
                return {
                    uri,
                    readContents: sinon.stub().rejects(new Error('file not found')),
                    dispose: sinon.stub()
                };
            }
            return {
                uri,
                readContents: sinon.stub().resolves('content'),
                dispose: sinon.stub()
            };
        });

        (mockScmService.findRepository as sinon.SinonStub).returns(makeMockRepo());

        await tool.openLink({
            ref: { path: 'src/deleted-file.ts', gitRef: 'abc123' },
            rightRef: { path: 'src/deleted-file.ts' }
        });

        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.true;
        const openCall = (mockOpenerService.getOpener as sinon.SinonStub).getCall(0);
        const diffUri = openCall.args[0] as URI;
        expect(DiffUris.isDiffUri(diffUri)).to.be.true;
        const [, rightUri] = DiffUris.decode(diffUri);
        expect(rightUri.scheme).to.equal(MEMORY_TEXT);
    });

    it('should open diff with both sides empty when neither can be resolved', async () => {
        mockResourceProvider.rejects(new Error('no resolver found'));

        await tool.openLink({
            ref: { path: 'src/file.ts', gitRef: 'abc123' },
            rightRef: 'src/file.ts'
        });

        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.true;
        const openCall = (mockOpenerService.getOpener as sinon.SinonStub).getCall(0);
        const diffUri = openCall.args[0] as URI;
        expect(DiffUris.isDiffUri(diffUri)).to.be.true;
        const [leftUri, rightUri] = DiffUris.decode(diffUri);
        expect(leftUri.scheme).to.equal(MEMORY_TEXT_READONLY);
        expect(rightUri.scheme).to.equal(MEMORY_TEXT);
    });

    it('should open diff with empty left side when ref is EmptyContentRef', async () => {
        await tool.openLink({
            ref: { empty: true, label: 'new file' },
            rightRef: 'src/new-file.ts'
        });

        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.true;
        const openCall = (mockOpenerService.getOpener as sinon.SinonStub).getCall(0);
        const diffUri = openCall.args[0] as URI;
        expect(DiffUris.isDiffUri(diffUri)).to.be.true;
        const [leftUri, rightUri] = DiffUris.decode(diffUri);
        expect(leftUri.scheme).to.equal(MEMORY_TEXT);
        expect(rightUri.scheme).to.equal('file');
    });

    it('should show error content when gitRef cannot be resolved due to missing SCM repo', async () => {
        (mockScmService.findRepository as sinon.SinonStub).returns(undefined);

        await tool.openLink({
            ref: { path: 'src/file.ts', gitRef: 'abc123' },
            rightRef: 'src/file.ts'
        });

        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.true;
        const openCall = (mockOpenerService.getOpener as sinon.SinonStub).getCall(0);
        const diffUri = openCall.args[0] as URI;
        expect(DiffUris.isDiffUri(diffUri)).to.be.true;
        const [leftUri] = DiffUris.decode(diffUri);
        expect(leftUri.scheme).to.equal(MEMORY_TEXT_READONLY);
        expect(leftUri.query).to.contain('Unable to resolve revision');
        expect(leftUri.query).to.contain('abc123');
    });

    it('should not open anything when single link ref is EmptyContentRef', async () => {
        await tool.openLink({ ref: { empty: true } });

        expect((mockOpenerService.getOpener as sinon.SinonStub).called).to.be.false;
        expect((mockEditorManager.open as sinon.SinonStub).called).to.be.false;
    });
});
