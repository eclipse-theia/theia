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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core';
import { CopilotClient } from '@github/copilot-sdk';
import { CopilotOAuthConfig } from '../common/copilot-oauth-config';
import { CopilotAuthServiceImpl } from './copilot-auth-service-impl';
import { selectSdkModelIds } from './copilot-sdk-mappers';

/**
 * Manages the lifecycle of a {@link CopilotClient}, which spawns and talks to the
 * official Copilot CLI over JSON-RPC.
 *
 * A single client is started lazily and shared for the lifetime of the
 * (connection-scoped) backend container. It is keyed on the authenticated user's
 * token so that a sign-in/sign-out transparently recreates the client against the
 * new identity.
 *
 * Note: this provider is bound in the per-connection container, so each frontend
 * connection runs its own CLI process. That is acceptable for this prototype but
 * would need a shared, per-user client cache for multi-user backend deployments.
 */
@injectable()
export class CopilotSdkClientProvider implements Disposable {

    @inject(CopilotAuthServiceImpl)
    protected readonly authService: CopilotAuthServiceImpl;

    @inject(CopilotOAuthConfig)
    protected readonly oauthConfig: CopilotOAuthConfig;

    protected clientPromise: Promise<CopilotClient> | undefined;
    protected clientToken: string | undefined;

    /**
     * Returns a started {@link CopilotClient} for the currently authenticated user,
     * creating (or recreating, if the identity changed) one on demand.
     */
    async getClient(): Promise<CopilotClient> {
        const token = await this.authService.getAccessToken();
        if (!token) {
            throw new Error('Not authenticated with GitHub Copilot. Please sign in first.');
        }
        if (this.clientPromise && this.clientToken === token) {
            return this.clientPromise;
        }
        // First use or a changed identity: (re)create the client. Capture the
        // previous client and assign synchronously so concurrent callers share
        // the same promise instead of spawning multiple CLI processes.
        const previous = this.clientPromise;
        this.clientToken = token;
        this.clientPromise = this.recreate(token, previous);
        return this.clientPromise;
    }

    /**
     * Lists the model IDs available to the authenticated user via the Copilot CLI.
     * Because the CLI is a recognized Copilot integration, this returns the full
     * current model lineup rather than the baseline set exposed by the direct REST API.
     */
    async listModelIds(): Promise<string[]> {
        const client = await this.getClient();
        const models = await client.listModels();
        return selectSdkModelIds(models);
    }

    protected async recreate(token: string, previous: Promise<CopilotClient> | undefined): Promise<CopilotClient> {
        if (previous) {
            try {
                const previousClient = await previous;
                await previousClient.stop();
            } catch (error) {
                console.warn('Copilot SDK: failed to stop previous client:', error);
            }
        }
        const client = new CopilotClient({
            gitHubToken: token,
            useLoggedInUser: false,
            baseDirectory: this.getBaseDirectory(),
            logLevel: 'error'
        });
        try {
            await client.start();
        } catch (error) {
            // Don't cache a failed start, otherwise every later call replays the rejection.
            if (this.clientToken === token) {
                this.clientPromise = undefined;
                this.clientToken = undefined;
            }
            throw error;
        }
        return client;
    }

    protected getBaseDirectory(): string {
        // Use a Theia-scoped Copilot home so the embedded CLI does not read or write
        // the user's real ~/.copilot login/session state. Setting baseDirectory also
        // makes the SDK disable the OS keychain for the spawned CLI.
        const dir = path.join(os.tmpdir(), 'theia-ai-copilot-sdk');
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (error) {
            console.warn('Copilot SDK: failed to create base directory:', error);
        }
        return dir;
    }

    /**
     * Stops and clears the current client. Safe to call when no client exists.
     */
    async reset(): Promise<void> {
        const previous = this.clientPromise;
        this.clientPromise = undefined;
        this.clientToken = undefined;
        if (previous) {
            try {
                const client = await previous;
                await client.stop();
            } catch (error) {
                console.warn('Copilot SDK: failed to stop client during reset:', error);
            }
        }
    }

    dispose(): void {
        this.reset();
    }
}
