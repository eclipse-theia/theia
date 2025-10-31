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

import { ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import type { Thread } from '@openai/codex-sdk';
import {
    CodexBackendRequest,
    CodexClient,
    CodexService
} from '../common/codex-service';

@injectable()
export class CodexServiceImpl implements CodexService {

    @inject(ILogger) @named('Codex')
    private logger: ILogger;

    private client: CodexClient;
    private sessionThreads = new Map<string, Thread>();
    private abortControllers = new Map<string, AbortController>();

    setClient(client: CodexClient): void {
        this.client = client;
    }

    async send(request: CodexBackendRequest, streamId: string): Promise<void> {
        if (!this.client) {
            throw new Error('Codex client not initialized');
        }
        this.sendMessages(streamId, request);
    }

    protected async sendMessages(streamId: string, request: CodexBackendRequest): Promise<void> {
        const abortController = new AbortController();
        this.abortControllers.set(streamId, abortController);

        try {
            const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<typeof import('@openai/codex-sdk')>;
            const { Codex } = await dynamicImport('@openai/codex-sdk');
            const codex = new Codex();

            const sessionId = request.sessionId || streamId;
            let thread = this.sessionThreads.get(sessionId);
            if (!thread) {
                thread = codex.startThread(request.options);
                this.sessionThreads.set(sessionId, thread);
                this.logger.info(`Created new Codex thread for session: ${sessionId}`);
            } else {
                this.logger.info(`Reusing existing Codex thread for session: ${sessionId}`);
            }

            const { events } = await thread.runStreamed(request.prompt);

            for await (const event of events) {
                if (abortController.signal.aborted) {
                    this.logger.info('Codex request cancelled:', streamId);
                    break;
                }

                this.client.sendToken(streamId, event as Parameters<CodexClient['sendToken']>[1]);

                if (typeof event === 'object' && event !== undefined && 'type' in event) {
                    const eventType = (event as { type: string }).type;
                    if (eventType === 'turn.completed' || eventType === 'turn.failed') {
                        break;
                    }
                }
            }

            this.client.sendToken(streamId, undefined);
        } catch (e) {
            this.logger.error('Codex error:', e);
            this.client.sendError(streamId, e instanceof Error ? e : new Error(String(e)));
        } finally {
            this.cleanup(streamId);
        }
    }

    cancel(streamId: string): void {
        const abortController = this.abortControllers.get(streamId);
        if (abortController) {
            abortController.abort('user canceled');
        }
        this.cleanup(streamId);
    }

    protected cleanup(streamId: string): void {
        this.abortControllers.delete(streamId);
    }
}
