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

import { CancellationToken, generateUuid, ILogger, PreferenceService } from '@theia/core';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { inject, injectable, LazyServiceIdentifier } from '@theia/core/shared/inversify';
import {
    OutputChannel,
    OutputChannelManager,
    OutputChannelSeverity
} from '@theia/output/lib/browser/output-channel';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    ClaudeCodeClient,
    ClaudeCodeOptions,
    ClaudeCodeRequest,
    ClaudeCodeService,
    SDKMessage,
    StreamMessage,
    ToolApprovalResponseMessage
} from '../common/claude-code-service';
import { CLAUDE_CODE_EXECUTABLE_PATH_PREF } from '../common/claude-code-preferences';

export const API_KEY_PREF = 'ai-features.anthropic.AnthropicApiKey';

@injectable()
export class ClaudeCodeClientImpl implements ClaudeCodeClient {
    protected tokenHandlers = new Map<string, (token?: StreamMessage) => void>();
    protected errorHandlers = new Map<string, (error: Error) => void>();

    // invoked by the backend
    sendToken(streamId: string, token?: StreamMessage): void {
        const handler = this.tokenHandlers.get(streamId);
        if (handler) {
            handler(token);
        }
    }

    // invoked by the backend
    sendError(streamId: string, error: Error): void {
        const handler = this.errorHandlers.get(streamId);
        if (handler) {
            handler(error);
        }
    }

    registerTokenHandler(streamId: string, handler: (token?: StreamMessage) => void): void {
        this.tokenHandlers.set(streamId, handler);
    }

    registerErrorHandler(streamId: string, handler: (error: Error) => void): void {
        this.errorHandlers.set(streamId, handler);
    }

    unregisterHandlers(streamId: string): void {
        this.tokenHandlers.delete(streamId);
        this.errorHandlers.delete(streamId);
    }
}

interface StreamState {
    id: string;
    tokens: (StreamMessage | undefined)[];
    isComplete: boolean;
    hasError: boolean;
    error?: Error;
    pendingResolve?: () => void;
    pendingReject?: (error: Error) => void;
}

@injectable()
export class ClaudeCodeFrontendService {

    @inject(ClaudeCodeService)
    protected claudeCodeBackendService: ClaudeCodeService;

    @inject(new LazyServiceIdentifier(() => ClaudeCodeClientImpl))
    protected client: ClaudeCodeClientImpl;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    @inject(ILogger)
    protected logger: ILogger;

    protected streams = new Map<string, StreamState>();

    async send(request: ClaudeCodeRequest, cancellationToken?: CancellationToken): Promise<AsyncIterable<StreamMessage>> {
        const streamState: StreamState = {
            id: this.generateStreamId(),
            tokens: [],
            isComplete: false,
            hasError: false
        };
        this.streams.set(streamState.id, streamState);
        this.setupStreamHandlers(streamState);

        cancellationToken?.onCancellationRequested(() => this.claudeCodeBackendService.cancel(streamState.id));

        const roots = await this.workspaceService.roots;
        const rootsUris = roots.map(root => FileUri.fsPath(root.resource.toString()));

        const prompt = request.prompt;
        const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
        const claudeCodePath = this.preferenceService.get<string>(CLAUDE_CODE_EXECUTABLE_PATH_PREF, undefined);
        this.getOutputChannel()?.appendLine(JSON.stringify(request, undefined, 2));

        await this.claudeCodeBackendService.send({
            prompt,
            apiKey,
            claudeCodePath,
            options: <ClaudeCodeOptions>{
                cwd: rootsUris[0],
                ...request.options
            }
        }, streamState.id);

        return this.createAsyncIterable(streamState);
    }

    protected generateStreamId(): string {
        return generateUuid();
    }

    protected setupStreamHandlers(streamState: StreamState): void {
        this.client.registerTokenHandler(streamState.id, (token?: SDKMessage) => {
            if (token === undefined) {
                streamState.isComplete = true;
            } else {
                this.getOutputChannel()?.appendLine(JSON.stringify(token, undefined, 2));
                streamState.tokens.push(token);
            }

            // Resolve any pending iterator
            if (streamState.pendingResolve) {
                streamState.pendingResolve();
                streamState.pendingResolve = undefined;
            }
        });

        this.client.registerErrorHandler(streamState.id, (error: Error) => {
            streamState.hasError = true;
            streamState.error = error;
            this.getOutputChannel()?.appendLine(JSON.stringify(error, undefined, 2), OutputChannelSeverity.Error);

            // Reject any pending iterator
            if (streamState.pendingReject) {
                streamState.pendingReject(error);
                streamState.pendingReject = undefined;
            }
        });
    }

    protected async *createAsyncIterable(streamState: StreamState): AsyncIterable<StreamMessage> {
        let currentIndex = 0;

        while (true) {
            // Check for available tokens
            if (currentIndex < streamState.tokens.length) {
                const token = streamState.tokens[currentIndex];
                currentIndex++;
                if (token !== undefined) {
                    yield token;
                }
                continue;
            }

            if (streamState.isComplete) {
                break;
            }
            if (streamState.hasError && streamState.error) {
                throw streamState.error;
            }

            // Wait for next token
            await new Promise<void>((resolve, reject) => {
                streamState.pendingResolve = resolve;
                streamState.pendingReject = reject;
            });
        }

        // Cleanup
        this.client.unregisterHandlers(streamState.id);
        this.streams.delete(streamState.id);
    }

    sendApprovalResponse(response: ToolApprovalResponseMessage): void {
        this.getOutputChannel()?.appendLine(JSON.stringify(response, undefined, 2));
        this.claudeCodeBackendService.handleApprovalResponse(response);
    }

    protected getOutputChannel(): OutputChannel | undefined {
        return this.outputChannelManager.getChannel('Claude Code');
    }

}
