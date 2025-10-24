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

import { ILogger, nls } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { execSync } from 'child_process';
import { existsSync, realpathSync } from 'fs';
import * as path from 'path';
import {
    CodexBackendRequest,
    CodexClient,
    CodexService
} from '../common/codex-service';

interface CodexSDK {
    Codex: new () => CodexInstance;
}

interface CodexInstance {
    startThread(options: {
        workingDirectory: string;
        sandboxMode?: 'read-only' | 'workspace-write' | 'full-access' | 'danger-full-access';
    }): CodexThread;
}

interface CodexThread {
    runStreamed(prompt: string): Promise<{ events: AsyncIterable<unknown> }>;
}

@injectable()
export class CodexServiceImpl implements CodexService {

    @inject(ILogger) @named('Codex')
    private logger: ILogger;

    private client: CodexClient;
    private threads = new Map<string, CodexThread>();
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
            const { Codex } = await this.importCodexSDK(request.codexPath);
            const codex = new Codex();

            // Get or create thread for this stream
            let thread = this.threads.get(streamId);
            if (!thread) {
                // Use workspace root from frontend, fallback to process.cwd() only if no workspace is open
                const workingDirectory = request.options?.workingDirectory || process.cwd();
                const sandboxMode = request.options?.sandboxMode || 'workspace-write';
                thread = codex.startThread({
                    workingDirectory,
                    sandboxMode
                });
                this.threads.set(streamId, thread);
            }

            const { events } = await thread.runStreamed(request.prompt);

            for await (const event of events) {
                if (abortController.signal.aborted) {
                    this.logger.info('Codex request cancelled:', streamId);
                    break;
                }

                this.client.sendToken(streamId, event as Parameters<CodexClient['sendToken']>[1]);

                // Check if turn is completed
                if (typeof event === 'object' && event !== null && 'type' in event) {
                    const eventType = (event as { type: string }).type;
                    if (eventType === 'turn.completed' || eventType === 'turn.failed') {
                        break;
                    }
                }
            }

            // Signal stream completion by sending undefined
            this.client.sendToken(streamId, undefined);
        } catch (e) {
            this.logger.error('Codex error:', e);
            this.client.sendError(streamId, e instanceof Error ? e : new Error(String(e)));
        } finally {
            this.cleanup(streamId);
        }
    }

    /**
     * Dynamically imports the Codex SDK from the global installation.
     * @param customCodexPath Optional custom path to Codex SDK directory
     * @returns An object containing the Codex SDK class.
     */
    protected async importCodexSDK(customCodexPath?: string): Promise<CodexSDK> {
        let codexPath: string;

        if (customCodexPath) {
            if (!existsSync(customCodexPath)) {
                throw new Error(nls.localize('theia/ai/codex/sdkNotFoundAt', 'Specified Codex SDK not found at: {0}', customCodexPath));
            }
            codexPath = realpathSync(customCodexPath);
        } else {
            codexPath = this.resolveCodexPath();
        }

        const sdkPath = path.join(codexPath, 'dist', 'index.js');

        // Check if file exists before importing
        if (!existsSync(sdkPath)) {
            throw new Error(nls.localize('theia/ai/codex/installationNotFoundAt', 'Codex SDK installation not found. ' +
                'Please install with: `npm install -g @openai/codex-sdk` ' +
                'and/or specify the path to the SDK in the settings. ' +
                'We looked at {0}', sdkPath));
        }

        const importPath = `file://${sdkPath}`;
        // We can not use dynamic import directly because webpack will try to
        // bundle the module at build time, which we don't want.
        // We also can't use a webpack ignore comment because the comment is stripped
        // during the build and then webpack still tries to resolve the module.
        const dynamicImport = new Function('path', 'return import(path)');
        return dynamicImport(importPath) as Promise<CodexSDK>;
    }

    protected resolveCodexPath(): string {
        try {
            const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
            return path.join(globalPath, '@openai/codex-sdk');
        } catch (error) {
            this.logger.error('Failed to resolve global npm path:', error);
            throw new Error(nls.localize('theia/ai/codex/installationNotFound', 'Codex SDK installation not found. ' +
                'Please install with: `npm install -g @openai/codex-sdk` ' +
                'and/or specify the path to the SDK in the settings.'));
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
        this.threads.delete(streamId);
    }
}
