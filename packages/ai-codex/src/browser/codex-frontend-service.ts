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
import {
    CodexClient,
    CodexRequest,
    CodexService,
    StreamEvent,
    CodexBackendRequest,
    CODEX_API_KEY_PREF,
    CODEX_SDK_PATH_PREF,
    CODEX_SANDBOX_MODE_PREF
} from '../common';

/**
 * Implementation of CodexClient interface for receiving RPC callbacks from backend.
 */
@injectable()
export class CodexClientImpl implements CodexClient {
    protected tokenHandlers = new Map<string, (token?: StreamEvent) => void>();
    protected errorHandlers = new Map<string, (error: Error) => void>();

    /**
     * Called by backend to send streaming tokens.
     * @param streamId Stream identifier
     * @param token Message to send, or `undefined` to signal end of stream
     */
    sendToken(streamId: string, token?: StreamEvent): void {
        const handler = this.tokenHandlers.get(streamId);
        if (handler) {
            handler(token);
        }
    }

    /**
     * Called by backend to send errors.
     * @param streamId Stream identifier
     * @param error Error object
     */
    sendError(streamId: string, error: Error): void {
        const handler = this.errorHandlers.get(streamId);
        if (handler) {
            handler(error);
        }
    }

    /**
     * Register a token handler for a specific stream.
     * @param streamId Stream identifier
     * @param handler Callback to handle tokens
     */
    registerTokenHandler(streamId: string, handler: (token?: StreamEvent) => void): void {
        this.tokenHandlers.set(streamId, handler);
    }

    /**
     * Register an error handler for a specific stream.
     * @param streamId Stream identifier
     * @param handler Callback to handle errors
     */
    registerErrorHandler(streamId: string, handler: (error: Error) => void): void {
        this.errorHandlers.set(streamId, handler);
    }

    /**
     * Unregister handlers for a specific stream (cleanup).
     * @param streamId Stream identifier
     */
    unregisterHandlers(streamId: string): void {
        this.tokenHandlers.delete(streamId);
        this.errorHandlers.delete(streamId);
    }
}

/**
 * Internal stream state tracking for async iteration.
 */
interface StreamState {
    id: string;
    tokens: (StreamEvent | undefined)[];
    isComplete: boolean;
    hasError: boolean;
    error?: Error;
    pendingResolve?: () => void;
    pendingReject?: (error: Error) => void;
}

/**
 * Frontend service for communicating with Codex backend via RPC.
 * Provides a clean async iterable API for streaming responses.
 */
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

    /**
     * Send a request to Codex SDK and get a streaming response.
     * @param request Request parameters
     * @param cancellationToken Optional cancellation token
     * @returns Async iterable of stream messages
     */
    async send(request: CodexRequest, cancellationToken?: CancellationToken): Promise<AsyncIterable<StreamEvent>> {
        const streamState: StreamState = {
            id: this.generateStreamId(),
            tokens: [],
            isComplete: false,
            hasError: false
        };
        this.streams.set(streamState.id, streamState);
        this.setupStreamHandlers(streamState);

        // Setup cancellation handler
        cancellationToken?.onCancellationRequested(() => {
            this.backendService.cancel(streamState.id);
            this.cleanup(streamState.id);
        });

        // Get API key, SDK path, and sandbox mode from preferences
        const apiKey = this.getApiKey();
        const codexPath = this.getSdkPath();
        const sandboxMode = this.getSandboxMode();

        // Get workspace root path
        const workingDirectory = await this.getWorkspaceRoot();

        // Build backend request
        const backendRequest: CodexBackendRequest = {
            prompt: request.prompt,
            options: {
                workingDirectory,
                ...request.options,
                sandboxMode
            },
            apiKey,
            codexPath
        };

        // Send request to backend
        await this.backendService.send(backendRequest, streamState.id);

        return this.createAsyncIterable(streamState);
    }

    /**
     * Generate a unique stream ID.
     * @returns UUID string
     */
    protected generateStreamId(): string {
        return generateUuid();
    }

    /**
     * Setup token and error handlers for a stream.
     * @param streamState Stream state object
     */
    protected setupStreamHandlers(streamState: StreamState): void {
        // Handle incoming tokens
        this.client.registerTokenHandler(streamState.id, (token?: StreamEvent) => {
            if (token === undefined) {
                streamState.isComplete = true;
            } else {
                streamState.tokens.push(token);
            }

            // Resolve any pending iterator
            if (streamState.pendingResolve) {
                streamState.pendingResolve();
                streamState.pendingResolve = undefined;
            }
        });

        // Handle errors
        this.client.registerErrorHandler(streamState.id, (error: Error) => {
            streamState.hasError = true;
            streamState.error = error;

            // Reject any pending iterator
            if (streamState.pendingReject) {
                streamState.pendingReject(error);
                streamState.pendingReject = undefined;
            }
        });
    }

    /**
     * Create an async iterable from a stream state.
     * @param streamState Stream state object
     * @returns Async iterable of stream messages
     */
    protected async *createAsyncIterable(streamState: StreamState): AsyncIterable<StreamEvent> {
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

            // Check completion
            if (streamState.isComplete) {
                break;
            }

            // Check errors
            if (streamState.hasError && streamState.error) {
                this.cleanup(streamState.id);
                throw streamState.error;
            }

            // Wait for next token
            await new Promise<void>((resolve, reject) => {
                streamState.pendingResolve = resolve;
                streamState.pendingReject = reject;
            });
        }

        // Cleanup
        this.cleanup(streamState.id);
    }

    /**
     * Cleanup handlers and stream state.
     * @param streamId Stream identifier
     */
    protected cleanup(streamId: string): void {
        this.client.unregisterHandlers(streamId);
        this.streams.delete(streamId);
    }

    /**
     * Get API key from preferences with fallback hierarchy.
     * 1. Check Codex-specific API key first (highest priority)
     * 2. Fall back to shared OpenAI API key
     * 3. Final fallback: undefined (backend will check OPENAI_API_KEY env var)
     * @returns API key or undefined
     */
    protected getApiKey(): string | undefined {
        // 1. Check Codex-specific API key first
        const codexKey = this.preferenceService.get<string>(CODEX_API_KEY_PREF);
        if (codexKey && codexKey.trim()) {
            return codexKey;
        }

        // 2. Fall back to shared OpenAI API key
        const openaiKey = this.preferenceService.get<string>(API_KEY_PREF);
        if (openaiKey && openaiKey.trim()) {
            return openaiKey;
        }

        // 3. Final fallback: undefined (backend will check OPENAI_API_KEY env var)
        return undefined;
    }

    /**
     * Get SDK path from preferences.
     * Falls back to undefined if not set (backend will resolve automatically).
     * @returns SDK path or undefined
     */
    protected getSdkPath(): string | undefined {
        const prefPath = this.preferenceService.get<string>(CODEX_SDK_PATH_PREF);
        if (prefPath && prefPath.trim()) {
            return prefPath;
        }
        return undefined;
    }

    /**
     * Get sandbox mode from preferences.
     * @returns Sandbox mode or 'workspace-write' as default
     */
    protected getSandboxMode(): 'read-only' | 'workspace-write' | 'danger-full-access' {
        const mode = this.preferenceService.get<string>(CODEX_SANDBOX_MODE_PREF);
        if (mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access') {
            return mode;
        }
        return 'workspace-write';
    }

    /**
     * Get workspace root path.
     * Returns the first workspace root as filesystem path, or undefined if no workspace is open.
     * @returns Workspace root path or undefined
     */
    protected async getWorkspaceRoot(): Promise<string | undefined> {
        const roots = await this.workspaceService.roots;
        if (roots && roots.length > 0) {
            return FileUri.fsPath(roots[0].resource.toString());
        }
        return undefined;
    }
}
