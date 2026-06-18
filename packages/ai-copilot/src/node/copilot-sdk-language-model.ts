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

import {
    LanguageModel,
    LanguageModelResponse,
    LanguageModelStatus,
    LanguageModelStreamResponsePart,
    UserRequest
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import type { CopilotClient, CopilotSession, PermissionRequestResult } from '@github/copilot-sdk';
import { buildSdkPrompt, flattenSdkPrompt } from './copilot-sdk-mappers';

/**
 * Language model implementation for GitHub Copilot backed by the official Copilot
 * CLI via `@github/copilot-sdk`.
 *
 * The CLI is an agent that owns its own tool-calling loop. To keep this prototype
 * aligned with Theia's "model is a function" contract, the model is used as a plain
 * chat backend: all agent tools (built-in and custom) are disabled and each request
 * is served by a fresh, streaming session. Multi-turn tool use and structured output
 * are intentionally not supported on this path (see the package README).
 */
export class CopilotSdkLanguageModel implements LanguageModel {

    constructor(
        public readonly id: string,
        public model: string,
        public status: LanguageModelStatus,
        public maxRetries: number,
        protected readonly clientProvider: () => Promise<CopilotClient>,
    ) { }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const client = await this.clientProvider();
        const prompt = flattenSdkPrompt(buildSdkPrompt(request.messages));

        const session = await client.createSession({
            model: this.model,
            streaming: true,
            // Prototype scope: expose no tools to the agent so the CLI behaves as a
            // plain chat backend instead of running its own tool loop on the backend host.
            availableTools: [],
            onPermissionRequest: (): PermissionRequestResult => ({ kind: 'reject' })
        });

        return { stream: this.streamResponse(session, prompt, cancellationToken) };
    }

    protected async *streamResponse(
        session: CopilotSession,
        prompt: string,
        cancellationToken?: CancellationToken
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        const queue: LanguageModelStreamResponsePart[] = [];
        let notify: (() => void) | undefined;
        let finished = false;
        let failure: unknown;
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;

        const wake = () => {
            const resolve = notify;
            notify = undefined;
            resolve?.();
        };
        const push = (part: LanguageModelStreamResponsePart) => {
            queue.push(part);
            wake();
        };
        const finish = (error?: unknown) => {
            if (error !== undefined) {
                failure = error;
            }
            finished = true;
            wake();
        };

        const disposables: Array<() => void> = [];
        disposables.push(session.on('assistant.message_delta', event => {
            if (event.data.deltaContent) {
                push({ content: event.data.deltaContent });
            }
        }));
        disposables.push(session.on('assistant.reasoning_delta', event => {
            if (event.data.deltaContent) {
                push({ thought: event.data.deltaContent, signature: '' });
            }
        }));
        disposables.push(session.on('assistant.message', event => {
            if (typeof event.data.outputTokens === 'number') {
                outputTokens = event.data.outputTokens;
            }
        }));
        disposables.push(session.on('assistant.usage', event => {
            if (typeof event.data.inputTokens === 'number') {
                inputTokens = event.data.inputTokens;
            }
            if (typeof event.data.outputTokens === 'number') {
                outputTokens = event.data.outputTokens;
            }
        }));
        disposables.push(session.on('session.idle', () => finish()));
        disposables.push(session.on('session.error', event => {
            // The CLI can report a terminal error (auth, quota, rate limit, context
            // limit, ...) without a following `session.idle`. Surface it as a stream
            // failure so the request rejects instead of hanging forever.
            const data = event.data;
            const detail = data.statusCode !== undefined ? ` (${data.errorType}, status ${data.statusCode})` : ` (${data.errorType})`;
            const error = new Error(`Copilot request failed${detail}: ${data.message}`);
            if (data.stack) {
                error.stack = data.stack;
            }
            finish(error);
        }));

        const cancelListener = cancellationToken?.onCancellationRequested(() => {
            session.abort().catch(() => { /* ignore abort failures */ });
            finish();
        });

        try {
            if (cancellationToken?.isCancellationRequested) {
                // Already cancelled before we started: don't bother sending.
                await session.abort().catch(() => { /* ignore abort failures */ });
                finish();
            } else {
                await session.send({ prompt });
            }
            while (true) {
                while (queue.length > 0) {
                    yield queue.shift()!;
                }
                if (finished) {
                    break;
                }
                await new Promise<void>(resolve => { notify = resolve; });
            }
            if (failure !== undefined) {
                throw failure;
            }
            if (inputTokens !== undefined || outputTokens !== undefined) {
                yield { input_tokens: inputTokens ?? 0, output_tokens: outputTokens ?? 0 };
            }
        } finally {
            for (const dispose of disposables) {
                dispose();
            }
            cancelListener?.dispose();
            try {
                await session.disconnect();
            } catch (error) {
                console.warn('Copilot SDK: failed to disconnect session:', error);
            }
        }
    }
}
