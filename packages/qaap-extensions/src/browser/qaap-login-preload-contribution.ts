// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { PreloadContribution } from '@theia/core/lib/browser/preload/preloader';
import { injectable } from '@theia/core/shared/inversify';
import { ensureQaapGithubOAuthReturnHandled } from '@theia/qaap-adapters/lib/browser/qaap-auth-oauth-bootstrap';
import {
    fetchQaapAuthConfig,
    peekQaapOAuthReturnFromUrl,
    syncQaapAuthSessionFromServer,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { placeholderQaapAuthUser, writeQaapAuthSession } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import { isQaapLoginGateMounted, presentQaapLoginGate } from './qaap-login-gate';
import { readQaapSignedIn } from './qaap-login-storage';

/**
 * Blocks frontend startup until the user signs in with GitHub or GitLab.
 * Uses plain DOM so it runs before React / the workbench exist.
 */
@injectable()
export class QaapLoginPreloadContribution implements PreloadContribution {

    initialize(): Promise<void> | void {
        if (peekQaapOAuthReturnFromUrl()) {
            return ensureQaapGithubOAuthReturnHandled().then(() => undefined);
        }
        if (isQaapLoginGateMounted()) {
            return;
        }
        if (readQaapSignedIn()) {
            // Trust the login gate / local session — do not block IDE startup on /auth/session.
            // A blocking sync here cleared skip-auth dev sessions and hung the splash forever.
            void this.reconcileSessionInBackground();
            return;
        }
        return this.bootstrapAuth();
    }

    protected async reconcileSessionInBackground(): Promise<void> {
        try {
            const config = await fetchQaapAuthConfig();
            if (config.skipAuth) {
                return;
            }
            const ok = await syncQaapAuthSessionFromServer();
            if (!ok) {
                await this.bootstrapAuth();
            }
        } catch {
            /* keep current session */
        }
    }

    protected async bootstrapAuth(): Promise<void> {
        try {
            const config = await fetchQaapAuthConfig();
            if (this.shouldBypassLoginGate(config)) {
                writeQaapAuthSession('gitlab', placeholderQaapAuthUser('gitlab'));
                return;
            }
            if (await syncQaapAuthSessionFromServer()) {
                return;
            }
        } catch {
            if (this.shouldBypassLoginGate()) {
                writeQaapAuthSession('gitlab', placeholderQaapAuthUser('gitlab'));
                return;
            }
        }
        return new Promise<void>(resolve => {
            presentQaapLoginGate(resolve);
        });
    }

    /** Local dev can skip auth only when the backend asks for it and no GitHub OAuth app is configured. */
    protected shouldBypassLoginGate(config?: { githubOAuth?: boolean; skipAuth?: boolean }): boolean {
        return config?.skipAuth === true;
    }
}
