// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from 'react-dom/client';
import { startGithubOAuth } from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { readQaapSignedIn, writeQaapAuthSession } from './qaap-login-storage';
import { QaapLoginProvider, QaapLoginView } from './qaap-login-view';

/** Simulated OAuth delay for providers without a server OAuth flow yet. */
const AUTH_PLACEHOLDER_MS = 1200;

/**
 * Fallback gate if {@link QaapLoginPreloadContribution} did not run (e.g. secondary window).
 */
@injectable()
export class QaapLoginContribution implements FrontendApplicationContribution {

    static readonly BODY_CLASS = 'qaap-login-active';

    @inject(StorageService)
    protected readonly storage: StorageService;

    protected host: HTMLElement | undefined;
    protected root: Root | undefined;
    protected app: FrontendApplication | undefined;
    protected loading: QaapLoginProvider | undefined;

    async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
        this.app = app;
        if (readQaapSignedIn() || document.getElementById('qaap-login-host')) {
            return;
        }
        document.body.classList.add(QaapLoginContribution.BODY_CLASS);
        this.hideWorkbench();
        this.mountLogin();
    }

    protected hideWorkbench(): void {
        const shellNode = this.app?.shell?.node;
        if (shellNode) {
            shellNode.style.visibility = 'hidden';
            shellNode.style.pointerEvents = 'none';
        }
    }

    protected showWorkbench(): void {
        const shellNode = this.app?.shell?.node;
        if (shellNode) {
            shellNode.style.visibility = '';
            shellNode.style.pointerEvents = '';
        }
        document.body.classList.remove(QaapLoginContribution.BODY_CLASS);
    }

    protected getDisplayApplicationName(): string {
        if (typeof document !== 'undefined') {
            const meta = document.querySelector('meta[name="application-name"]');
            const fromMeta = meta?.getAttribute('content')?.trim();
            if (fromMeta) {
                return fromMeta;
            }
        }
        return FrontendApplicationConfigProvider.get().applicationName;
    }

    protected mountLogin(): void {
        if (this.host) {
            return;
        }
        this.host = document.createElement('div');
        this.host.id = 'qaap-login-host';
        document.body.appendChild(this.host);
        this.root = createRoot(this.host);
        this.renderLogin();
    }

    protected renderLogin(): void {
        this.root?.render(
            React.createElement(QaapLoginView, {
                appName: this.getDisplayApplicationName(),
                loading: this.loading,
                onSignIn: provider => this.handleSignIn(provider),
            })
        );
    }

    protected async handleSignIn(provider: QaapLoginProvider): Promise<void> {
        if (this.loading) {
            return;
        }
        if (provider === 'github') {
            startGithubOAuth();
            return;
        }
        this.loading = provider;
        this.renderLogin();
        await new Promise<void>(resolve => window.setTimeout(resolve, AUTH_PLACEHOLDER_MS));
        writeQaapAuthSession(provider);
        await this.storage.setData('qaap.auth.signedIn', true);
        await this.storage.setData('qaap.auth.provider', provider);
        this.loading = undefined;
        this.root?.unmount();
        this.host?.remove();
        this.host = undefined;
        this.root = undefined;
        this.showWorkbench();
    }
}
