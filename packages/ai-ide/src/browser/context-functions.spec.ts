// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { ListChatContext, ResolveChatContext, AddFileToChatContext } from './context-functions';
import { CancellationTokenSource } from '@theia/core';
import { ChatContextManager, MutableChatModel, MutableChatRequestModel, MutableChatResponseModel } from '@theia/ai-chat';
import { fail } from 'assert';
import { ResolvedAIContextVariable } from '@theia/ai-core';
disableJSDOM();

describe('Context Functions Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: Partial<MutableChatRequestModel>;

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        // Disable JSDOM after all tests
        disableJSDOM();
    });

    beforeEach(() => {
        cancellationTokenSource = new CancellationTokenSource();
        const context: Partial<ChatContextManager> = {
            addVariables: () => { },
            getVariables: () => mockCtx.context?.variables as ResolvedAIContextVariable[]
        };
        mockCtx = {
            response: {
                cancellationToken: cancellationTokenSource.token
            } as MutableChatResponseModel,
            context: {
                variables: [{
                    variable: { id: 'file1', name: 'File' },
                    arg: '/path/to/file',
                    contextValue: 'file content'
                } as ResolvedAIContextVariable]
            },
            session: {
                context
            } as MutableChatModel
        };
    });

    afterEach(() => {
        cancellationTokenSource.dispose();
    });

    it('ListChatContext should respect cancellation token', async () => {
        const listChatContext = new ListChatContext();
        cancellationTokenSource.cancel();

        const result = await listChatContext.getTool().handler('', mockCtx);
        if (typeof result !== 'string') {
            fail(`Wrong tool call result type: ${result}`);
        }
        const jsonResponse = JSON.parse(result);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('ResolveChatContext should respect cancellation token', async () => {
        const resolveChatContext = new ResolveChatContext();
        cancellationTokenSource.cancel();

        const result = await resolveChatContext.getTool().handler('{"contextElementId":"file1/path/to/file"}', mockCtx);
        if (typeof result !== 'string') {
            fail(`Wrong tool call result type: ${result}`);
        }
        const jsonResponse = JSON.parse(result);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('AddFileToChatContext should respect cancellation token', async () => {
        const addFileToChatContext = new AddFileToChatContext();
        cancellationTokenSource.cancel();

        const result = await addFileToChatContext.getTool().handler('{"filesToAdd":["/new/path/to/file"]}', mockCtx);
        if (typeof result !== 'string') {
            fail(`Wrong tool call result type: ${result}`);
        }
        const jsonResponse = JSON.parse(result);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });
});
