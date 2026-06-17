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
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { UserRequest } from '@theia/ai-core/lib/common';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { CancellationTokenSource, editor, IRange, languages, Position, Uri } from '@theia/monaco-editor-core/esm/vs/editor/editor.api';
import { CodeCompletionAgentImpl } from './code-completion-agent';

disableJSDOM();

describe('CodeCompletionAgentImpl', () => {
    let agent: CodeCompletionAgentImpl;
    let model: editor.ITextModel;
    let sendRequestStub: sinon.SinonStub;
    let capturedRequest: UserRequest | undefined;
    let postProcessStub: sinon.SinonStub;

    const inlineContext: languages.InlineCompletionContext = {
        triggerKind: languages.InlineCompletionTriggerKind.Automatic,
        selectedSuggestionInfo: undefined,
        includeInlineEdits: false,
        includeInlineCompletions: false,
        requestIssuedDateTime: Date.now(),
        earliestShownDateTime: Date.now()
    };

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({});
    });

    beforeEach(() => {
        // Minimal stub: the agent only passes the model through to promptService (stubbed below).
        model = { uri: Uri.file('/tmp/code-completion-agent.spec.ts') } as editor.ITextModel;

        capturedRequest = undefined;
        sendRequestStub = sinon.stub().callsFake((_lm: unknown, req: UserRequest) => {
            capturedRequest = req;
            return Promise.resolve({ text: 'COMPLETION' });
        });
        postProcessStub = sinon.stub().callsFake((text: string) => text);

        agent = new CodeCompletionAgentImpl();
        Object.assign(agent, {
            languageModelService: { sendRequest: sendRequestStub },
            languageModelRegistry: {
                selectLanguageModel: sinon.stub().resolves({ id: 'fake/model' })
            },
            promptService: {
                getResolvedPromptFragment: sinon.stub().resolves({ text: 'prompt text' }),
                getPromptVariantInfo: sinon.stub().returns({ variantId: 'v1', isCustomized: false })
            },
            progressService: {
                showProgress: sinon.stub().resolves({ cancel: () => { /* no-op */ } })
            },
            postProcessor: { postProcess: postProcessStub },
            logger: { error: () => { /* no-op */ } }
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    after(() => {
        disableJSDOM();
    });

    it('disables reasoning on the LLM request', async () => {
        const tokenSource = new CancellationTokenSource();
        await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);
        expect(sendRequestStub.calledOnce).to.be.true;
        expect(capturedRequest?.reasoning).to.deep.equal({ level: 'off' });
    });

    it('disables streaming on the LLM request', async () => {
        const tokenSource = new CancellationTokenSource();
        await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);
        expect(capturedRequest?.settings?.stream).to.equal(false);
    });

    it('forwards Monaco\'s cancellation token to the LLM request', async () => {
        // Forwarded so explicit user cancellation (e.g. Esc) propagates to providers that honor it,
        // such as Anthropic's `stream.abort()`.
        const tokenSource = new CancellationTokenSource();
        await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);
        expect(capturedRequest?.cancellationToken).to.equal(tokenSource.token);
    });

    it('discards the response when the token is cancelled before returning', async () => {
        const tokenSource = new CancellationTokenSource();
        sendRequestStub.callsFake((_lm: unknown, req: UserRequest) => {
            capturedRequest = req;
            // Cancel after the request was issued so the post-`sendRequest` check fires.
            tokenSource.cancel();
            return Promise.resolve({ text: 'LATE_COMPLETION' });
        });

        const result = await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);

        expect(result).to.be.undefined;
    });

    it('bails before sending the request when the token is already cancelled', async () => {
        const tokenSource = new CancellationTokenSource();
        tokenSource.cancel();

        const result = await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);

        expect(result).to.be.undefined;
        expect(sendRequestStub.called).to.be.false;
    });

    it('returns undefined when no language model is available', async () => {
        Object.assign(agent, {
            languageModelRegistry: { selectLanguageModel: sinon.stub().resolves(undefined) }
        });
        const tokenSource = new CancellationTokenSource();

        const result = await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);

        expect(result).to.be.undefined;
        expect(sendRequestStub.called).to.be.false;
    });

    it('returns undefined when no prompt is resolved', async () => {
        Object.assign(agent, {
            promptService: {
                getResolvedPromptFragment: sinon.stub().resolves(undefined),
                getPromptVariantInfo: sinon.stub().returns(undefined)
            }
        });
        const tokenSource = new CancellationTokenSource();

        const result = await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);

        expect(result).to.be.undefined;
        expect(sendRequestStub.called).to.be.false;
    });

    it('post-processes the completion text before returning it', async () => {
        postProcessStub.callsFake((text: string) => `<<${text}>>`);
        const tokenSource = new CancellationTokenSource();

        const result = await agent.provideInlineCompletions(model, new Position(2, 3), inlineContext, tokenSource.token);

        expect(postProcessStub.calledOnceWithExactly('COMPLETION')).to.be.true;
        expect(result!.items[0].insertText).to.equal('<<COMPLETION>>');
    });

    it('uses the requested cursor position as the completion range', async () => {
        const tokenSource = new CancellationTokenSource();

        const result = await agent.provideInlineCompletions(model, new Position(5, 7), inlineContext, tokenSource.token);

        const range = result!.items[0].range as IRange;
        expect(range.startLineNumber).to.equal(5);
        expect(range.startColumn).to.equal(7);
        expect(range.endLineNumber).to.equal(5);
        expect(range.endColumn).to.equal(7);
    });

    it('cancels the progress indicator regardless of outcome', async () => {
        const progressCancel = sinon.spy();
        Object.assign(agent, {
            progressService: { showProgress: sinon.stub().resolves({ cancel: progressCancel }) }
        });
        const tokenSource = new CancellationTokenSource();

        await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);

        expect(progressCancel.calledOnce).to.be.true;
    });

    it('swallows errors and clears the progress indicator', async () => {
        const progressCancel = sinon.spy();
        Object.assign(agent, {
            progressService: { showProgress: sinon.stub().resolves({ cancel: progressCancel }) }
        });
        sendRequestStub.rejects(new Error('boom'));
        sinon.stub(console, 'error');
        const tokenSource = new CancellationTokenSource();

        const result = await agent.provideInlineCompletions(model, new Position(1, 1), inlineContext, tokenSource.token);

        expect(result).to.be.undefined;
        expect(progressCancel.calledOnce).to.be.true;
    });
});
