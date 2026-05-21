// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ensureQaapGithubOAuthReturnHandled } from '@theia/qaap-adapters/lib/browser/qaap-auth-oauth-bootstrap';
import {
    QAAP_REQUIRE_LOGIN_EVENT,
    fetchQaapAuthConfig,
    peekQaapOAuthErrorReasonFromUrl,
    peekQaapOAuthReturnFromUrl,
    revealQaapWorkbenchAfterAuth,
    syncQaapAuthSessionFromServer,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { placeholderQaapAuthUser, writeQaapAuthSession } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import { dismissQaapLoginGate, isQaapLoginGateMounted, presentQaapLoginGate } from './qaap-login-gate';
import { readQaapAuthUser, readQaapSignedIn } from './qaap-login-storage';

/**
 * Shows the login gate when there is no session (e.g. after sign-out) and hides it when signed in.
 * Complements {@link QaapLoginPreloadContribution} on first load and {@link qaap-login-gate.js}.
 */
@injectable()
export class QaapLoginContribution implements FrontendApplicationContribution {

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected readonly onAuthSessionChanged = (): void => {
        void this.syncLoginGateWithSession();
    };

    protected readonly onRequireLogin = (): void => {
        void this.syncLoginGateWithSession();
    };

    async onDidInitializeLayout(_app: FrontendApplication): Promise<void> {
        window.addEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        window.addEventListener(QAAP_REQUIRE_LOGIN_EVENT, this.onRequireLogin);

        const oauthErrorReason = peekQaapOAuthErrorReasonFromUrl();
        const oauthResult = await ensureQaapGithubOAuthReturnHandled();
        if (oauthResult === 'github') {
            this.messages.info(nls.localize('qaap/auth/githubConnected', 'Connected to GitHub.'));
            window.dispatchEvent(new Event('qaap-auth-open-first-repo'));
            this.requestWorkbenchLayoutRefresh();
        } else if (oauthResult === 'error') {
            const detail = oauthErrorReason
                ? nls.localize('qaap/auth/githubConnectFailedWithReason', 'GitHub sign-in failed: {0}', oauthErrorReason)
                : nls.localize('qaap/auth/githubConnectFailed', 'GitHub sign-in failed.');
            this.messages.error(detail);
            console.error('[qaap-auth] OAuth callback returned error.', oauthErrorReason ?? '(no reason)');
        }

        await this.syncLoginGateWithSession();
    }

    protected requestWorkbenchLayoutRefresh(): void {
        window.requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    }

    onStop(): void {
        window.removeEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        window.removeEventListener(QAAP_REQUIRE_LOGIN_EVENT, this.onRequireLogin);
    }

    protected shouldBypassLoginGate(config?: { githubOAuth?: boolean; skipAuth?: boolean }): boolean {
        if (config?.skipAuth && !config.githubOAuth) {
            return true;
        }
        return false;
    }

    protected async syncLoginGateWithSession(): Promise<void> {
        if (peekQaapOAuthReturnFromUrl() === 'github') {
            return;
        }
        try {
            const config = await fetchQaapAuthConfig();
            if (this.shouldBypassLoginGate(config)) {
                if (!readQaapSignedIn()) {
                    writeQaapAuthSession('gitlab', placeholderQaapAuthUser('gitlab'));
                }
            } else {
                // Reconcile localStorage with the backend (VPS/container restarts can drop server sessions).
                await syncQaapAuthSessionFromServer();
            }
        } catch {
            if (this.shouldBypassLoginGate()) {
                if (!readQaapSignedIn()) {
                    writeQaapAuthSession('gitlab', placeholderQaapAuthUser('gitlab'));
                }
            } else {
                await syncQaapAuthSessionFromServer();
            }
        }
        if (readQaapSignedIn()) {
            dismissQaapLoginGate();
            revealQaapWorkbenchAfterAuth();
            this.requestWorkbenchLayoutRefresh();
            return;
        }
        if (!isQaapLoginGateMounted()) {
            presentQaapLoginGate();
        }
    }

    protected hasStoredRealUser(): boolean {
        const user = readQaapAuthUser();
        return !!user?.login && user.login !== 'github-user' && user.login !== 'gitlab-user';
    }
}
