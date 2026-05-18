// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { PreloadContribution } from '@theia/core/lib/browser/preload/preloader';
import { injectable } from '@theia/core/shared/inversify';
import { QAAP_LOGIN_GITHUB_SVG, QAAP_LOGIN_GITLAB_SVG } from './qaap-login-icons';
import { startGithubOAuth } from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { QaapAuthProvider, readQaapSignedIn, writeQaapAuthSession } from './qaap-login-storage';

const AUTH_PLACEHOLDER_MS = 1200;

/**
 * Blocks frontend startup until the user signs in with GitHub or GitLab.
 * Uses plain DOM so it runs before React / the workbench exist.
 */
@injectable()
export class QaapLoginPreloadContribution implements PreloadContribution {

    initialize(): Promise<void> {
        if (readQaapSignedIn() || document.getElementById('qaap-login-host')) {
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            this.mountGate(resolve);
        });
    }

    protected mountGate(onComplete: () => void): void {
        document.body.classList.add('qaap-login-active');

        const host = document.createElement('div');
        host.id = 'qaap-login-host';
        host.setAttribute('role', 'dialog');
        host.setAttribute('aria-modal', 'true');
        host.setAttribute('aria-labelledby', 'qaap-login-title');

        const appName = document.querySelector('meta[name="application-name"]')?.getAttribute('content')?.trim() || 'Qaap';
        const logoUrl = document.querySelector('meta[name="application-icon"]')?.getAttribute('content')?.trim() || './media/qaap-logo.svg';

        host.innerHTML = `
<div class="qaap-login-overlay">
  <header class="qaap-login-brand">
    <img class="qaap-login-logo" src="${escapeAttr(logoUrl)}" width="64" height="64" alt="" />
    <h1 id="qaap-login-title" class="qaap-login-title">${escapeHtml(appName)}</h1>
    <p class="qaap-login-tagline">A pocket workspace for coding agents.<br/>Sign in to connect your repos.</p>
  </header>
  <div class="qaap-login-spacer"></div>
  <div class="qaap-login-actions">
    <button type="button" id="qaap-login-github" class="qaap-login-btn qaap-login-btn--primary" data-provider="github" aria-label="Continue with GitHub">
      <span class="qaap-login-btn-icon-slot" data-icon="github">${QAAP_LOGIN_GITHUB_SVG}</span>
      <span class="qaap-login-btn-label">Continue with GitHub</span>
    </button>
    <button type="button" id="qaap-login-gitlab" class="qaap-login-btn qaap-login-btn--secondary" data-provider="gitlab" aria-label="Continue with GitLab">
      <span class="qaap-login-btn-icon-slot" data-icon="gitlab">${QAAP_LOGIN_GITLAB_SVG}</span>
      <span class="qaap-login-btn-label">Continue with GitLab</span>
    </button>
  </div>
  <footer class="qaap-login-footer">
    By continuing you agree to the <a href="#" data-qaap-link="terms">terms</a> &amp; <a href="#" data-qaap-link="privacy">privacy</a>.
    <br/>${escapeHtml(appName)} never reads your repos without permission.
  </footer>
</div>`;

        document.body.appendChild(host);

        for (const el of document.getElementsByClassName('theia-preload')) {
            (el as HTMLElement).style.display = 'none';
        }

        const githubBtn = host.querySelector<HTMLButtonElement>('#qaap-login-github');
        const gitlabBtn = host.querySelector<HTMLButtonElement>('#qaap-login-gitlab');

        const wire = (button: HTMLButtonElement | null, provider: QaapAuthProvider): void => {
            if (!button) {
                return;
            }
            button.addEventListener('click', event => {
                event.preventDefault();
                this.authorize(provider, button, host, onComplete);
            });
            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.authorize(provider, button, host, onComplete);
                }
            });
        };

        wire(githubBtn, 'github');
        wire(gitlabBtn, 'gitlab');

        host.addEventListener('click', event => {
            if ((event.target as HTMLElement | null)?.closest('[data-qaap-link]')) {
                event.preventDefault();
            }
        });

        githubBtn?.focus();
    }

    protected authorize(
        provider: QaapAuthProvider,
        button: HTMLButtonElement,
        host: HTMLElement,
        onComplete: () => void
    ): void {
        if (button.disabled || button.classList.contains('qaap-login-btn--loading')) {
            return;
        }

        if (provider === 'github') {
            startGithubOAuth();
            return;
        }

        for (const btn of host.querySelectorAll<HTMLButtonElement>('button[data-provider]')) {
            btn.disabled = true;
            btn.classList.add('qaap-login-btn--loading');
            btn.setAttribute('aria-busy', 'true');
        }

        const iconSlot = button.querySelector('.qaap-login-btn-icon-slot');
        if (iconSlot) {
            iconSlot.innerHTML = '<span class="qaap-login-spinner" aria-hidden="true"></span>';
        }
        const label = button.querySelector('.qaap-login-btn-label');
        if (label) {
            label.textContent = 'Authorizing…';
        }

        window.setTimeout(() => {
            writeQaapAuthSession(provider);
            host.remove();
            document.body.classList.remove('qaap-login-active');
            onComplete();
        }, AUTH_PLACEHOLDER_MS);
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
    return escapeHtml(value).replace(/'/g, '&#39;');
}
