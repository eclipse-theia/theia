// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { startGithubOAuth } from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { QAAP_LOGIN_GITHUB_SVG, QAAP_LOGIN_GITLAB_SVG } from './qaap-login-icons';
import { QaapAuthProvider, readQaapSignedIn, writeQaapAuthSession } from './qaap-login-storage';

const AUTH_PLACEHOLDER_MS = 1200;
const BODY_CLASS = 'qaap-login-active';
const HOST_ID = 'qaap-login-host';

let activeHost: HTMLElement | undefined;

export function isQaapLoginGateMounted(): boolean {
    return activeHost !== undefined || document.getElementById(HOST_ID) !== null;
}

export function dismissQaapLoginGate(): void {
    const host = activeHost ?? document.getElementById(HOST_ID);
    host?.remove();
    activeHost = undefined;
    document.body.classList.remove(BODY_CLASS);
}

export function presentQaapLoginGate(onSignedIn?: () => void): void {
    if (readQaapSignedIn() || isQaapLoginGateMounted()) {
        return;
    }
    document.body.classList.add(BODY_CLASS);

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-labelledby', 'qaap-login-title');
    activeHost = host;

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
    <button type="button" id="qaap-login-github" class="qaap-login-btn qaap-login-btn--primary" data-provider="github" aria-label="Iniciar con GitHub">
      <span class="qaap-login-btn-icon-slot" data-icon="github">${QAAP_LOGIN_GITHUB_SVG}</span>
      <span class="qaap-login-btn-label">Iniciar con GitHub</span>
    </button>
    <button type="button" id="qaap-login-gitlab" class="qaap-login-btn qaap-login-btn--secondary" data-provider="gitlab" aria-label="Iniciar con GitLab">
      <span class="qaap-login-btn-icon-slot" data-icon="gitlab">${QAAP_LOGIN_GITLAB_SVG}</span>
      <span class="qaap-login-btn-label">Iniciar con GitLab</span>
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

    const complete = (): void => {
        dismissQaapLoginGate();
        onSignedIn?.();
    };

    const wire = (button: HTMLButtonElement | null, provider: QaapAuthProvider): void => {
        if (!button) {
            return;
        }
        const handler = (event: Event): void => {
            event.preventDefault();
            authorize(provider, button, host, complete);
        };
        button.addEventListener('click', handler);
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                handler(event);
            }
        });
    };

    wire(host.querySelector<HTMLButtonElement>('#qaap-login-github'), 'github');
    wire(host.querySelector<HTMLButtonElement>('#qaap-login-gitlab'), 'gitlab');

    host.addEventListener('click', event => {
        if ((event.target as HTMLElement | null)?.closest('[data-qaap-link]')) {
            event.preventDefault();
        }
    });

    host.querySelector<HTMLButtonElement>('#qaap-login-github')?.focus();
}

function authorize(
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
        label.textContent = 'Autorizando…';
    }

    window.setTimeout(() => {
        writeQaapAuthSession(provider);
        onComplete();
    }, AUTH_PLACEHOLDER_MS);
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
