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

import { ChildProcess, spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import { join } from 'path';
import { inject, injectable, named, preDestroy } from '@theia/core/shared/inversify';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ILogger, nls } from '@theia/core';
import { CopilotAuthState, DeviceCodeResponse } from '../common/copilot-auth-service';
import { CopilotCliLocator } from './copilot-cli-locator';
import { CopilotCredentialStore } from './copilot-credential-store';
import { CopilotRuntimeEnv } from './copilot-runtime-env';
import { CopilotSdkClientProvider } from './copilot-sdk-client-provider';

/**
 * Time after which a login that never reports a code is given up on.
 */
const LOGIN_CODE_TIMEOUT_MS = 30_000;

/**
 * Shape of the GitHub tokens the CLI persists, used to recognize one in the files it wrote.
 */
const TOKEN_PATTERN = /\bgh[a-z]_[A-Za-z0-9_]{16,}\b/;

/**
 * Upper bound for the files inspected for the token, so that a stray large file is not read.
 */
const MAX_INSPECTED_FILE_BYTES = 1024 * 1024;

/**
 * Authentication against GitHub Copilot, performed by the official Copilot CLI on our behalf.
 *
 * Access to the Copilot features is granted per OAuth application and the built-in Theia OAuth app
 * is not entitled for them, whereas the Copilot CLI is. This provider therefore does not run an
 * OAuth flow of its own but drives `copilot login --device-code` and reports its progress, so that
 * the familiar sign-in dialog can be used.
 *
 * The credentials end up owned by this application rather than by the CLI: the login is run against
 * a private, temporary Copilot home with the system keychain disabled, so that the CLI writes its
 * token there instead of into the user's keyring. The token is then moved into
 * {@link CopilotCredentialStore} and the temporary home is removed. Signing out consequently only
 * has to delete our own entry, and never touches credentials of the user's machine such as their
 * keyring entries or their GitHub CLI sign-in.
 */
@injectable()
export class CopilotCliAuthProvider {

    @inject(CopilotSdkClientProvider)
    protected readonly sdkClientProvider: CopilotSdkClientProvider;

    @inject(CopilotCliLocator)
    protected readonly cliLocator: CopilotCliLocator;

    @inject(CopilotCredentialStore)
    protected readonly credentialStore: CopilotCredentialStore;

    @inject(ILogger) @named('ai-copilot:CopilotCliAuthProvider')
    protected readonly logger: ILogger;

    protected loginProcess: ChildProcess | undefined;
    protected loginResult: Deferred<boolean> | undefined;
    protected loginHome: string | undefined;
    protected loginEnterpriseUrl: string | undefined;
    protected loginAccountLabel: string | undefined;

    /**
     * Stops a sign-in that is still in progress when the connection this provider belongs to closes.
     * Unbinding a container runs `@preDestroy` rather than `dispose`, matching the client provider.
     * Without this, the `copilot login` child process and the temporary home holding its token would
     * be left behind.
     */
    @preDestroy()
    protected stop(): void {
        this.cancelLogin().catch(error => this.logger.warn('Copilot: failed to cancel the sign-in on shutdown:', error));
    }

    /**
     * Starts `copilot login --device-code` and resolves once it reported the code the user has to
     * enter. The process keeps running and polls GitHub itself until {@link waitForLogin} is awaited.
     */
    async startLogin(enterpriseUrl?: string): Promise<DeviceCodeResponse> {
        await this.cancelLogin();
        this.loginAccountLabel = undefined;

        const args = ['login', '--device-code'];
        if (enterpriseUrl) {
            args.push('--host', this.toHostUrl(enterpriseUrl));
        }

        // Resolved before anything is written, so that a missing CLI does not leave a directory behind.
        const cli = await this.cliLocator.resolve();
        const home = await this.createLoginHome();
        const noopBrowser = await this.createNoopBrowser(home);
        this.loginHome = home;
        this.loginEnterpriseUrl = enterpriseUrl;

        // The device code flow is requested explicitly so that the CLI reports a code for the dialog
        // instead of opening a browser on the backend host, which is not where the user is sitting.
        const child = spawn(cli, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: this.createLoginEnv(home, noopBrowser)
        });
        this.loginProcess = child;

        const result = new Deferred<boolean>();
        this.loginResult = result;
        // The outcome may settle before anyone awaits it, e.g. when the authorization is denied while
        // the dialog still shows the code. Observe it here so that such a rejection is never unhandled;
        // `waitForLogin` still sees the outcome through its own await of the same promise.
        result.promise.catch(() => { /* observed in waitForLogin */ });
        const code = new Deferred<DeviceCodeResponse>();
        let output = '';

        const onOutput = (chunk: Buffer | string) => {
            output += String(chunk);
            const parsed = this.parseDeviceCode(output);
            if (parsed) {
                code.resolve(parsed);
            }
            this.loginAccountLabel = this.parseAccountLabel(output) ?? this.loginAccountLabel;
        };
        child.stdout?.on('data', onOutput);
        child.stderr?.on('data', onOutput);

        // A login that was given up on has no one waiting for its outcome anymore, and rejecting it
        // would surface as an unhandled rejection. Only the login that is still the current one is
        // reported to, because that is the one `waitForLogin` can be awaiting.
        const rejectResult = (error: Error) => {
            if (this.loginResult === result) {
                result.reject(error);
            }
        };

        child.on('error', error => {
            code.reject(error);
            rejectResult(error);
        });
        child.on('close', exitCode => {
            if (this.loginProcess === child) {
                this.loginProcess = undefined;
            }
            if (exitCode === 0) {
                code.reject(new Error('The Copilot CLI finished before reporting a device code.'));
                result.resolve(true);
            } else {
                const message = this.extractFailure(output) ?? `The Copilot CLI login exited with code ${exitCode}.`;
                code.reject(new Error(message));
                rejectResult(new Error(message));
            }
        });

        const timeout = setTimeout(() => code.reject(new Error('Timed out waiting for the Copilot CLI to report a device code.')), LOGIN_CODE_TIMEOUT_MS);
        try {
            return await code.promise;
        } catch (error) {
            await this.cancelLogin();
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Waits for the login started by {@link startLogin} to complete.
     * Resolves `false` when the authorization was denied or expired.
     */
    async waitForLogin(): Promise<boolean> {
        const result = this.loginResult;
        const home = this.loginHome;
        if (!result || !home) {
            throw new Error(nls.localize('theia/ai/copilot/noLoginInProgress', 'No Copilot CLI login is in progress. Please start the sign-in again.'));
        }
        try {
            if (!await result.promise) {
                return false;
            }
            await this.storeCredentials(home);
            return true;
        } finally {
            this.loginResult = undefined;
            this.loginHome = undefined;
            // The token was moved into our own store, so the plain copy must not linger.
            await this.removeLoginHome(home);
            // The runtime caches the credentials it started with, so pick up the new ones.
            await this.sdkClientProvider.reset();
        }
    }

    /**
     * Moves the token the CLI just persisted into our own credential store.
     */
    protected async storeCredentials(home: string): Promise<void> {
        const token = await this.findStoredToken(home);
        if (!token) {
            throw new Error(nls.localize('theia/ai/copilot/tokenNotPersisted',
                'The Copilot CLI reported a successful sign-in but did not persist a token where it was expected. '
                + 'This can happen when the Copilot CLI changes how it stores credentials.'));
        }
        await this.credentialStore.set({
            token,
            accountLabel: this.loginAccountLabel,
            enterpriseUrl: this.loginEnterpriseUrl
        });
    }

    /**
     * Terminates a login that is still in progress, if any.
     *
     * Resolves once the token the CLI may already have written has been removed again, so that a
     * caller which cancels a sign-in can rely on nothing being left behind in plain text.
     */
    async cancelLogin(): Promise<void> {
        // Settle a login that may be awaited in `waitForLogin`, so that closing the dialog while it is
        // still polling does not leave that request pending for the rest of the session.
        this.loginResult?.resolve(false);
        this.loginResult = undefined;
        // Killing an already exited process is a no-op, so the state does not have to be tracked.
        this.loginProcess?.kill();
        this.loginProcess = undefined;
        const home = this.loginHome;
        this.loginHome = undefined;
        if (home) {
            await this.removeLoginHome(home);
        }
    }

    /**
     * Reports whether this application holds Copilot credentials.
     *
     * Deliberately based on our own store rather than on what the Copilot CLI reports: the CLI also
     * accepts a token from the environment or the sign-in of the GitHub CLI, and neither of those is
     * a sign-in of this application, so neither may make it appear signed in.
     */
    async getAuthState(): Promise<CopilotAuthState> {
        const credentials = await this.credentialStore.get();
        if (!credentials) {
            return { isAuthenticated: false };
        }
        return {
            isAuthenticated: true,
            accountLabel: credentials.accountLabel,
            enterpriseUrl: credentials.enterpriseUrl
        };
    }

    /**
     * Discards the credentials of this application. Nothing outside of it is touched.
     */
    async signOut(): Promise<void> {
        await this.cancelLogin();
        await this.credentialStore.delete();
        await this.sdkClientProvider.reset();
    }

    /**
     * Creates the private Copilot home the login is run against.
     */
    protected async createLoginHome(): Promise<string> {
        const home = await fs.mkdtemp(join(os.tmpdir(), 'theia-copilot-login-'));
        // With the keychain disabled, the CLI only persists the token when it is allowed to write it
        // plainly. It lands in this private directory and is removed again right after it was taken over.
        await fs.writeFile(join(home, 'settings.json'), JSON.stringify({ storeTokenPlaintext: true }, undefined, 2), 'utf8');
        return home;
    }

    /**
     * Writes the opener the CLI is pointed at instead of a real browser, and returns its path.
     *
     * The CLI opens a browser whenever it believes one is available, even for the device code flow, and
     * prefers the command in `BROWSER` over the opener of the platform. Pointing it at a script that
     * does nothing is therefore the reliable way to keep the flow in the dialog, where the user can read
     * and copy the code. Opening a browser would also be wrong whenever the backend does not run on the
     * user's own machine.
     */
    protected async createNoopBrowser(home: string): Promise<string> {
        if (process.platform === 'win32') {
            const batch = join(home, 'no-browser.cmd');
            await fs.writeFile(batch, '@exit /b 0\r\n', 'utf8');
            return batch;
        }
        const shell = join(home, 'no-browser.sh');
        await fs.writeFile(shell, '#!/bin/sh\nexit 0\n', { encoding: 'utf8', mode: 0o755 });
        return shell;
    }

    /**
     * Removes the private Copilot home, including the token the CLI wrote into it.
     */
    protected async removeLoginHome(home: string): Promise<void> {
        try {
            await fs.rm(home, { recursive: true, force: true });
        } catch (error) {
            this.logger.warn(`Copilot: failed to remove the temporary sign-in directory ${home}:`, error);
        }
    }

    /**
     * Builds the environment for the login process.
     *
     * The CLI is pointed at a private home and its use of the system keychain is disabled, so that
     * it persists the token where we can take it over instead of in the keyring of the user. Tokens
     * from the environment are removed so that a sign-in always establishes fresh credentials rather
     * than silently succeeding with something the user configured elsewhere.
     */
    protected createLoginEnv(home: string, noopBrowser: string): Record<string, string | undefined> {
        return {
            ...CopilotRuntimeEnv.withoutTokens(process.env),
            COPILOT_HOME: home,
            COPILOT_DISABLE_KEYTAR: '1',
            // Keep the flow in the dialog, see createNoopBrowser. The display variables are dropped as
            // well so that nothing can open a window even if the opener were ignored.
            BROWSER: noopBrowser,
            DISPLAY: undefined,
            WAYLAND_DISPLAY: undefined
        };
    }

    /**
     * Searches the configuration the CLI wrote in its private home for the persisted token.
     *
     * The file and the field the CLI uses are not part of its public interface, so every JSON file it
     * wrote is searched for a value shaped like a GitHub token rather than relying on a fixed layout.
     */
    protected async findStoredToken(home: string): Promise<string | undefined> {
        for (const file of await this.listCandidateFiles(home)) {
            try {
                // Checked before reading, so that a stray large file is never held in memory.
                if ((await fs.stat(file)).size > MAX_INSPECTED_FILE_BYTES) {
                    continue;
                }
                const token = this.findTokenInText(await fs.readFile(file, 'utf8'));
                if (token) {
                    return token;
                }
            } catch (error) {
                this.logger.warn(`Copilot: failed to inspect ${file} for the persisted token:`, error);
            }
        }
        return undefined;
    }

    /**
     * The files of the private home that are inspected for the token.
     *
     * The logs are skipped, and the configuration the CLI writes is not plain JSON but carries
     * comments, so the files are searched as text rather than parsed.
     */
    protected async listCandidateFiles(home: string): Promise<string[]> {
        try {
            const entries = await fs.readdir(home, { withFileTypes: true });
            return entries
                .filter(entry => entry.isFile() && entry.name !== 'settings.json' && !entry.name.startsWith('no-browser.'))
                .map(entry => join(home, entry.name));
        } catch (error) {
            this.logger.warn(`Copilot: failed to list ${home}:`, error);
            return [];
        }
    }

    /**
     * Searches text for a value shaped like a GitHub token.
     *
     * Only the files the CLI wrote into the private home of this sign-in are searched, so anything
     * shaped like a token in them is the token that was just obtained.
     */
    protected findTokenInText(text: string): string | undefined {
        return text.match(TOKEN_PATTERN)?.[0];
    }

    /**
     * Extracts the login the CLI reported for the account that signed in, if it reported one.
     */
    protected parseAccountLabel(output: string): string | undefined {
        return output.match(/Signed in successfully as\s+([^\s.]+)/)?.[1];
    }

    /**
     * Extracts the verification URL and the user code from the output of the CLI.
     * Returns `undefined` while the output does not contain both yet.
     */
    protected parseDeviceCode(output: string): DeviceCodeResponse | undefined {
        const url = output.match(/https?:\/\/\S*\/login\/device\b/)?.[0];
        const userCode = output.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/)?.[1];
        if (!url || !userCode) {
            return undefined;
        }
        return {
            verification_uri: url,
            user_code: userCode
        };
    }

    /**
     * Describes why a login failed, based on what the CLI reported.
     *
     * A line that names the problem is preferred, and the tail of the output is used otherwise, since
     * the wording of the CLI is not stable enough to rely on and a bare exit code is not diagnosable.
     */
    protected extractFailure(output: string): string | undefined {
        const lines = output.split('\n').map(entry => entry.trim())
            // The CLI reports a failure to copy the code to the clipboard even on a healthy login,
            // which must not be mistaken for the reason a login failed.
            .filter(entry => entry.length > 0 && !/clipboard/i.test(entry));
        const reported = [...lines].reverse().find(entry => /error|denied|failed|unauthorized|policy/i.test(entry));
        if (reported) {
            return reported;
        }
        const tail = lines.slice(-3).join(' ');
        return tail.length > 0 ? `The Copilot CLI login failed: ${tail}` : undefined;
    }

    /**
     * Turns the configured GitHub Enterprise deployment into the URL the CLI is pointed at.
     *
     * A bare domain is the expected form and gets a scheme. Plain HTTP is upgraded rather than passed
     * on: the sign-in carries credentials, and a host that only matched "http" at the start of its
     * name, such as `httpbin.example.com`, must not be mistaken for a URL that already has a scheme.
     */
    protected toHostUrl(enterpriseUrl: string): string {
        const url = enterpriseUrl.trim();
        if (/^https:\/\//i.test(url)) {
            return url;
        }
        if (/^http:\/\//i.test(url)) {
            return url.replace(/^http:\/\//i, 'https://');
        }
        return `https://${url}`;
    }
}
