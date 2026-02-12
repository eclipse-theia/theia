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
import { ChatContextManager, ChatToolContext, MutableChatModel, MutableChatRequestModel, MutableChatResponseModel } from '@theia/ai-chat';
import { fail } from 'assert';
import { AIVariableResolutionRequest, ResolvedAIContextVariable } from '@theia/ai-core';
import { ContextFileValidationService, FileValidationState } from '@theia/ai-chat/lib/browser/context-file-validation-service';
disableJSDOM();

describe('Context Functions Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: ChatToolContext;

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
            getVariables: () => mockCtx.request.context?.variables as ResolvedAIContextVariable[]
        };
        const mockRequest = {
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
        } as unknown as MutableChatRequestModel;
        mockCtx = {
            cancellationToken: cancellationTokenSource.token,
            request: mockRequest,
            response: {} as MutableChatResponseModel
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

describe('AddFileToChatContext Validation Tests', () => {
    let mockCtx: ChatToolContext;
    let addedFiles: AIVariableResolutionRequest[];

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        addedFiles = [];
        const context: Partial<ChatContextManager> = {
            addVariables: (...vars: AIVariableResolutionRequest[]) => {
                addedFiles.push(...vars);
            },
            getVariables: () => []
        };
        const mockRequest = {
            context: {
                variables: []
            },
            session: {
                context
            } as MutableChatModel
        } as unknown as MutableChatRequestModel;
        mockCtx = {
            cancellationToken: new CancellationTokenSource().token,
            request: mockRequest,
            response: {} as MutableChatResponseModel
        };
    });

    it('should add valid files to context', async () => {
        const mockValidationService: ContextFileValidationService = {
            validateFile: async () => ({ state: FileValidationState.VALID })
        };

        const addFileToChatContext = new AddFileToChatContext();
        (addFileToChatContext as unknown as { validationService: ContextFileValidationService }).validationService = mockValidationService;

        const result = await addFileToChatContext.getTool().handler(
            '{"filesToAdd":["/valid/file1.ts","/valid/file2.ts"]}',
            mockCtx
        );

        if (typeof result !== 'string') {
            fail(`Wrong tool call result type: ${result}`);
        }

        const jsonResponse = JSON.parse(result);
        expect(jsonResponse.added).to.have.lengthOf(2);
        expect(jsonResponse.added).to.include('/valid/file1.ts');
        expect(jsonResponse.added).to.include('/valid/file2.ts');
        expect(jsonResponse.rejected).to.have.lengthOf(0);
        expect(jsonResponse.summary.totalRequested).to.equal(2);
        expect(jsonResponse.summary.added).to.equal(2);
        expect(jsonResponse.summary.rejected).to.equal(0);
        expect(addedFiles).to.have.lengthOf(2);
    });

    it('should reject non-existent files', async () => {
        const mockValidationService: ContextFileValidationService = {
            validateFile: async file => {
                if (file === '/nonexistent/file.ts') {
                    return {
                        state: FileValidationState.INVALID_NOT_FOUND,
                        message: 'File does not exist'
                    };
                }
                return { state: FileValidationState.VALID };
            }
        };

        const addFileToChatContext = new AddFileToChatContext();
        (addFileToChatContext as unknown as { validationService: ContextFileValidationService }).validationService = mockValidationService;

        const result = await addFileToChatContext.getTool().handler(
            '{"filesToAdd":["/valid/file.ts","/nonexistent/file.ts"]}',
            mockCtx
        );

        if (typeof result !== 'string') {
            fail(`Wrong tool call result type: ${result}`);
        }

        const jsonResponse = JSON.parse(result);
        expect(jsonResponse.added).to.have.lengthOf(1);
        expect(jsonResponse.added).to.include('/valid/file.ts');
        expect(jsonResponse.rejected).to.have.lengthOf(1);
        expect(jsonResponse.rejected[0].file).to.equal('/nonexistent/file.ts');
        expect(jsonResponse.rejected[0].reason).to.equal('File does not exist');
        expect(jsonResponse.rejected[0].state).to.equal(FileValidationState.INVALID_NOT_FOUND);
        expect(jsonResponse.summary.totalRequested).to.equal(2);
        expect(jsonResponse.summary.added).to.equal(1);
        expect(jsonResponse.summary.rejected).to.equal(1);
        expect(addedFiles).to.have.lengthOf(1);
    });

    it('should reject files in secondary workspace roots', async () => {
        const mockValidationService: ContextFileValidationService = {
            validateFile: async file => {
                if (file === '/secondary/root/file.ts') {
                    return {
                        state: FileValidationState.INVALID_SECONDARY,
                        message: 'File is in a secondary workspace root. AI agents can only access files in the first workspace root.'
                    };
                }
                return { state: FileValidationState.VALID };
            }
        };

        const addFileToChatContext = new AddFileToChatContext();
        (addFileToChatContext as unknown as { validationService: ContextFileValidationService }).validationService = mockValidationService;

        const result = await addFileToChatContext.getTool().handler(
            '{"filesToAdd":["/secondary/root/file.ts"]}',
            mockCtx
        );

        if (typeof result !== 'string') {
            fail(`Wrong tool call result type: ${result}`);
        }

        const jsonResponse = JSON.parse(result);
        expect(jsonResponse.added).to.have.lengthOf(0);
        expect(jsonResponse.rejected).to.have.lengthOf(1);
        expect(jsonResponse.rejected[0].file).to.equal('/secondary/root/file.ts');
        expect(jsonResponse.rejected[0].state).to.equal(FileValidationState.INVALID_SECONDARY);
        expect(addedFiles).to.have.lengthOf(0);
    });

    it('should add all files when validation service is not available', async () => {
        const addFileToChatContext = new AddFileToChatContext();

        const result = await addFileToChatContext.getTool().handler(
            '{"filesToAdd":["/file1.ts","/file2.ts"]}',
            mockCtx
        );

        if (typeof result !== 'string') {
            fail(`Wrong tool call result type: ${result}`);
        }

        const jsonResponse = JSON.parse(result);
        expect(jsonResponse.added).to.have.lengthOf(2);
        expect(jsonResponse.rejected).to.have.lengthOf(0);
        expect(jsonResponse.summary.totalRequested).to.equal(2);
        expect(jsonResponse.summary.added).to.equal(2);
        expect(jsonResponse.summary.rejected).to.equal(0);
        expect(addedFiles).to.have.lengthOf(2);
    });
});
