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

import { inject, injectable } from '@theia/core/shared/inversify';
import { CancellationToken, generateUuid, PreferenceService } from '@theia/core';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { API_KEY_PREF } from '@theia/ai-openai/lib/common/openai-preferences';
import type { ThreadEvent } from '@openai/codex-sdk';
import {
    CodexClient,
    CodexRequest,
    CodexService,
    CodexBackendRequest,
    CODEX_API_KEY_PREF
} from '../common';

@injectable()
export class CodexClientImpl implements CodexClient {
    protected tokenHandlers = new Map<string, (token?: ThreadEvent) => void>();
    protected errorHandlers = new Map<string, (error: Error) => void>();

    /**
     * `undefined` token signals end of stream per RPC protocol.
     */
    sendToken(streamId: string, token?: ThreadEvent): void {
        const handler = this.tokenHandlers.get(streamId);
        if (handler) {
            handler(token);
        }
    }

    sendError(streamId: string, error: Error): void {
        const handler = this.errorHandlers.get(streamId);
        if (handler) {
            handler(error);
        }
    }

    registerTokenHandler(streamId: string, handler: (token?: ThreadEvent) => void): void {
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
    tokens: (ThreadEvent | undefined)[];
    isComplete: boolean;
    hasError: boolean;
    error?: Error;
    pendingResolve?: () => void;
    pendingReject?: (error: Error) => void;
}

@injectable()
export class CodexFrontendService {

    @inject(CodexService)
    protected readonly backendService: CodexService;

    @inject(CodexClientImpl)
    protected readonly client: CodexClientImpl;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected streams = new Map<string, StreamState>();

    async send(request: CodexRequest, cancellationToken?: CancellationToken): Promise<AsyncIterable<ThreadEvent>> {
        const streamState: StreamState = {
            id: this.generateStreamId(),
            tokens: [],
            isComplete: false,
            hasError: false
        };
        this.streams.set(streamState.id, streamState);
        this.setupStreamHandlers(streamState);

        cancellationToken?.onCancellationRequested(() => {
            this.backendService.cancel(streamState.id);
            this.cleanup(streamState.id);
        });

        const apiKey = this.getApiKey();
        const sandboxMode = request.sandboxMode ?? 'workspace-write';
        const workingDirectory = await this.getWorkspaceRoot();

        const backendRequest: CodexBackendRequest = {
            prompt: request.prompt,
            options: {
                workingDirectory,
                ...request.options,
                sandboxMode
            },
            apiKey,
            sessionId: request.sessionId
        };

        await this.backendService.send(backendRequest, streamState.id);

        return this.createAsyncIterable(streamState);
    }

    protected generateStreamId(): string {
        return generateUuid();
    }

    protected setupStreamHandlers(streamState: StreamState): void {
        this.client.registerTokenHandler(streamState.id, (token?: ThreadEvent) => {
            if (token === undefined) {
                streamState.isComplete = true;
            } else {
                streamState.tokens.push(token);
            }

            if (streamState.pendingResolve) {
                streamState.pendingResolve();
                streamState.pendingResolve = undefined;
            }
        });

        this.client.registerErrorHandler(streamState.id, (error: Error) => {
            streamState.hasError = true;
            streamState.error = error;

            if (streamState.pendingReject) {
                streamState.pendingReject(error);
                streamState.pendingReject = undefined;
            }
        });
    }

    protected async *createAsyncIterable(streamState: StreamState): AsyncIterable<ThreadEvent> {
        let currentIndex = 0;

        while (true) {
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
                this.cleanup(streamState.id);
                throw streamState.error;
            }

            await new Promise<void>((resolve, reject) => {
                streamState.pendingResolve = resolve;
                streamState.pendingReject = reject;
            });
        }

        this.cleanup(streamState.id);
    }

    protected cleanup(streamId: string): void {
        this.client.unregisterHandlers(streamId);
        this.streams.delete(streamId);
    }

    /**
     * Fallback hierarchy:
     * 1. Codex-specific API key (highest priority)
     * 2. Shared OpenAI API key
     * 3. undefined (backend will check OPENAI_API_KEY env var)
     */
    protected getApiKey(): string | undefined {
        const codexKey = this.preferenceService.get<string>(CODEX_API_KEY_PREF);
        if (codexKey && codexKey.trim()) {
            return codexKey;
        }

        const openaiKey = this.preferenceService.get<string>(API_KEY_PREF);
        if (openaiKey && openaiKey.trim()) {
            return openaiKey;
        }

        return undefined;
    }

    protected async getWorkspaceRoot(): Promise<string | undefined> {
        const roots = await this.workspaceService.roots;
        if (roots && roots.length > 0) {
            return FileUri.fsPath(roots[0].resource.toString());
        }
        return undefined;
    }
}
