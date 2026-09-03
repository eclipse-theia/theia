// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { promises as fs } from 'fs';
import { join } from 'path';
import { inject, injectable, named, preDestroy } from '@theia/core/shared/inversify';
import { ILogger, nls, URI } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileUri } from '@theia/core/lib/common/file-uri';
import type { CopilotClient, CopilotClientOptions } from './copilot-sdk-types';
import { CopilotCredentials, CopilotCredentialStore } from './copilot-credential-store';
import { CopilotCliLocator } from './copilot-cli-locator';
import { CopilotRuntimeEnv } from './copilot-runtime-env';
import { CopilotSdkApi, CopilotSdkLoader } from './copilot-sdk-loader';
import { selectSdkModelIds } from './copilot-sdk-mappers';

/**
 * Manages the lifecycle of a {@link CopilotClient}, which spawns and talks to the
 * official Copilot CLI over JSON-RPC.
 *
 * The runtime is given the token this application holds, and nothing else: credentials the CLI could
 * otherwise pick up on its own, from the environment or from the sign-in of the GitHub CLI, are not a
 * sign-in of this application and are deliberately kept out of reach. The token is established by
 * {@link CopilotCliAuthProvider} and kept in {@link CopilotCredentialStore}.
 *
 * A single client is started lazily and shared for the lifetime of the (connection-scoped) backend
 * container. It is recreated when the host configuration changes.
 *
 * Note: this provider is bound in the per-connection container, so each frontend connection runs
 * its own CLI process, authenticated with the credentials of the backend host. This is not suitable
 * for multi-user backend deployments, where every connected frontend would share a single identity.
 */
@injectable()
export class CopilotSdkClientProvider {

    @inject(CopilotCredentialStore)
    protected readonly credentialStore: CopilotCredentialStore;

    @inject(CopilotCliLocator)
    protected readonly cliLocator: CopilotCliLocator;

    @inject(CopilotSdkLoader)
    protected readonly sdkLoader: CopilotSdkLoader;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    @inject(ILogger) @named('ai-copilot:CopilotSdkClientProvider')
    protected readonly logger: ILogger;

    protected clientPromise: Promise<CopilotClient> | undefined;
    protected clientConfigKey: string | undefined;

    /**
     * Returns a started {@link CopilotClient}, creating (or recreating, if the
     * configuration changed) one on demand.
     */
    async getClient(): Promise<CopilotClient> {
        const credentials = await this.credentialStore.get();
        if (!credentials) {
            throw new Error(nls.localize('theia/ai/copilot/notSignedInSignInFirst', 'Not signed in to GitHub Copilot. Please sign in first.'));
        }
        const configKey = this.getConfigKey(credentials);
        if (this.clientPromise && this.clientConfigKey === configKey) {
            return this.clientPromise;
        }
        // First use or changed credentials: (re)create the client. Capture the
        // previous client and assign synchronously so concurrent callers share
        // the same promise instead of spawning multiple CLI processes.
        const previous = this.clientPromise;
        this.clientConfigKey = configKey;
        this.clientPromise = this.recreate(configKey, credentials, previous);
        return this.clientPromise;
    }

    /**
     * Lists the model IDs available to the authenticated user via the Copilot CLI.
     * Because the CLI runs under an entitled identity, this returns the full current model lineup
     * rather than the baseline set that the direct REST API exposes to an unentitled OAuth app.
     */
    async listModelIds(): Promise<string[]> {
        const client = await this.getClient();
        try {
            const models = await client.listModels();
            return selectSdkModelIds(models);
        } catch (error) {
            throw this.enrichEntitlementError(error);
        }
    }

    /**
     * Replaces the bare authorization failure of the Copilot runtime with an explanation of the
     * possible causes, because the runtime only reports that the feature is not authorized.
     */
    protected enrichEntitlementError(error: unknown): unknown {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('not authorized to use this Copilot feature') && !message.includes('Access denied by policy settings')) {
            return error;
        }
        return new Error(nls.localize('theia/ai/copilot/notAuthorized',
            'GitHub Copilot rejected the request as not authorized for this account. Either the account has no Copilot subscription, or '
            + 'access has to be enabled by an administrator through an organization or enterprise policy. Signing out and in again also '
            + 'renews credentials that were revoked. GitHub reports requests sent to an API host that does not match the subscription the '
            + 'same way, so as a last resort the host can be set explicitly with the `COPILOT_API_URL` environment variable of the backend. '
            + 'Reported by the Copilot runtime: {0}', message));
    }

    protected getConfigKey(credentials: CopilotCredentials): string {
        return `${credentials.enterpriseUrl ?? ''}|${credentials.token}`;
    }

    protected async recreate(configKey: string, credentials: CopilotCredentials, previous: Promise<CopilotClient> | undefined): Promise<CopilotClient> {
        if (previous) {
            try {
                const previousClient = await previous;
                await previousClient.stop();
            } catch (error) {
                this.logger.warn('Copilot SDK: failed to stop previous client:', error);
            }
        }
        const sdk = await this.sdkLoader.load();
        const client = new sdk.CopilotClient(this.createClientOptions(sdk, credentials, await this.cliLocator.resolve(), await this.getCopilotHome()));
        try {
            await client.start();
        } catch (error) {
            // Don't cache a failed start, otherwise every later call replays the rejection.
            if (this.clientConfigKey === configKey) {
                this.clientPromise = undefined;
                this.clientConfigKey = undefined;
            }
            throw error;
        }
        return client;
    }

    /**
     * Builds the options of the {@link CopilotClient}.
     *
     * The token of this application is passed explicitly and the resolution of a logged-in user is
     * switched off, so that the runtime cannot fall back to credentials this application does not own.
     *
     * The CLI is passed explicitly as well, see {@link CopilotCliLocator}: the SDK would otherwise look
     * for the JavaScript entry point of a platform package installed next to itself and spawn it with
     * `process.execPath`, which is the Electron binary rather than Node.js in an Electron application.
     *
     * The runtime is configured in `empty` mode rather than in the `copilot-cli` mode the SDK defaults
     * to. That mode brings the ambient behaviour of the CLI along, which the SDK documents as unsuitable
     * for an application serving requests on a backend: instructions and skills found on the host,
     * session and memory stores, host git operations and plugins. Theia drives the conversation itself
     * and declares the tools of each request, so none of that applies, and `empty` mode additionally
     * keeps the runtime away from the system keychain. Its two requirements are met here, a persistence
     * location ({@link getCopilotHome}) and an explicit tool list per session.
     */
    protected createClientOptions(sdk: CopilotSdkApi, credentials: CopilotCredentials, cliPath: string, baseDirectory: string): CopilotClientOptions {
        return {
            connection: sdk.RuntimeConnection.forStdio({ path: cliPath }),
            mode: 'empty',
            baseDirectory,
            gitHubToken: credentials.token,
            useLoggedInUser: false,
            logLevel: 'error',
            env: this.createRuntimeEnv(credentials)
        };
    }

    /**
     * The Copilot home the runtime is pointed at, below the configuration directory of Theia.
     *
     * Requests are served in sessions that the runtime persists in its home, and the default home is
     * the one the user's own Copilot CLI uses. Prompts sent from Theia would end up listed among the
     * conversations the user started themselves, so this application keeps its own.
     */
    protected async getCopilotHome(): Promise<string> {
        const configDirectory = FileUri.fsPath(new URI(await this.envVariablesServer.getConfigDirUri()));
        const home = join(configDirectory, 'copilot');
        await fs.mkdir(home, { recursive: true });
        return home;
    }

    /**
     * Returns the environment for the runtime process.
     *
     * Tokens from the environment are removed: the runtime accepts them even when a token is passed
     * explicitly, and they are not a sign-in of this application. The GitHub host is taken from the
     * credentials, so that the runtime always talks to the deployment that was signed in to.
     *
     * The Copilot API endpoint is deliberately not set: the runtime resolves the one belonging to the
     * subscription from the token, including for Business and Enterprise seats. The environment of the
     * backend is inherited as-is, so an operator can still override it with `COPILOT_API_URL` should
     * that resolution ever fail for a deployment.
     */
    protected createRuntimeEnv(credentials: CopilotCredentials): Record<string, string | undefined> {
        return {
            ...CopilotRuntimeEnv.withoutTokens(process.env),
            ...(credentials.enterpriseUrl ? { COPILOT_GH_HOST: credentials.enterpriseUrl } : {})
        };
    }

    /**
     * Stops and clears the current client. Safe to call when no client exists.
     */
    async reset(): Promise<void> {
        const previous = this.clientPromise;
        this.clientPromise = undefined;
        this.clientConfigKey = undefined;
        if (previous) {
            try {
                const client = await previous;
                await client.stop();
            } catch (error) {
                this.logger.warn('Copilot SDK: failed to stop client during reset:', error);
            }
        }
    }

    /**
     * Stops the CLI when the container this provider lives in goes away, which happens when the
     * frontend connection it belongs to is closed.
     *
     * A closing connection unbinds its container, and unbinding runs `@preDestroy` rather than
     * `dispose`. Without this hook the CLI of every closed connection would keep running for the rest
     * of the lifetime of the backend.
     */
    @preDestroy()
    protected async stop(): Promise<void> {
        await this.reset();
    }
}
