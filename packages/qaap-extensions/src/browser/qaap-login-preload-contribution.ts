// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { PreloadContribution } from '@theia/core/lib/browser/preload/preloader';
import { injectable } from '@theia/core/shared/inversify';
import { ensureQaapGithubOAuthReturnHandled } from '@theia/qaap-adapters/lib/browser/qaap-auth-oauth-bootstrap';
import {
    QAAP_REQUIRE_LOGIN_EVENT,
    fetchQaapAuthConfig,
    peekQaapOAuthReturnFromUrl,
    syncQaapAuthSessionFromServer,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { placeholderQaapAuthUser, writeQaapAuthSession } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import { isQaapLoginGateMounted, presentQaapLoginGate } from './qaap-login-gate';
import { readQaapSignedIn } from './qaap-login-storage';

/**
 * Reconciles auth during preload. The HTML login gate ({@link qaap-login-gate.js}) runs before
 * bundle.js; preload must not block startup on stale localStorage after a VPS container restart.
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
        void this.bootstrapAuth();
        return;
    }

    protected async reconcileSessionInBackground(): Promise<void> {
        try {
            const config = await fetchQaapAuthConfig();
            if (config.skipAuth) {
                return;
            }
            const ok = await syncQaapAuthSessionFromServer();
            if (!ok) {
                // Server session gone (VPS container restart) — show login without blocking preload.
                window.dispatchEvent(new Event(QAAP_REQUIRE_LOGIN_EVENT));
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
        presentQaapLoginGate();
    }

    /** Local dev can skip auth only when the backend asks for it and no GitHub OAuth app is configured. */
    protected shouldBypassLoginGate(config?: { githubOAuth?: boolean; skipAuth?: boolean }): boolean {
        return config?.skipAuth === true;
    }
}
