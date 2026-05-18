// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { QAAP_LOGIN_GITHUB_SVG, QAAP_LOGIN_GITLAB_SVG } from './qaap-login-icons';

export type QaapLoginProvider = 'github' | 'gitlab';

export interface QaapLoginViewProps {
    appName: string;
    loading: QaapLoginProvider | undefined;
    onSignIn: (provider: QaapLoginProvider) => void;
}

function getApplicationIconUrl(): string {
    const meta = typeof document !== 'undefined'
        ? document.querySelector('meta[name="application-icon"]')
        : undefined;
    const fromMeta = meta?.getAttribute('content')?.trim();
    if (fromMeta) {
        return fromMeta;
    }
    return './media/qaap-logo.svg';
}

const GitHubIcon: React.FC = () => (
    <span className='qaap-login-btn-icon-slot' dangerouslySetInnerHTML={{ __html: QAAP_LOGIN_GITHUB_SVG }} />
);

const GitLabIcon: React.FC = () => (
    <span className='qaap-login-btn-icon-slot' dangerouslySetInnerHTML={{ __html: QAAP_LOGIN_GITLAB_SVG }} />
);

export const QaapLoginView: React.FC<QaapLoginViewProps> = ({ appName, loading, onSignIn }) => (
    <div className='qaap-login-overlay' role='dialog' aria-modal={true} aria-labelledby='qaap-login-title'>
        <header className='qaap-login-brand'>
            <img
                className='qaap-login-logo'
                src={getApplicationIconUrl()}
                width={64}
                height={64}
                alt=''
            />
            <h1 id='qaap-login-title' className='qaap-login-title'>{appName}</h1>
            <p className='qaap-login-tagline'>
                A pocket workspace for coding agents.
                <br />
                Sign in to connect your repos.
            </p>
        </header>

        <div className='qaap-login-spacer' />

        <div className='qaap-login-actions'>
            <button
                type='button'
                id='qaap-login-github'
                className={`qaap-login-btn qaap-login-btn--primary${loading === 'github' ? ' qaap-login-btn--loading' : ''}`}
                disabled={loading !== undefined}
                aria-label='Continue with GitHub'
                aria-busy={loading === 'github'}
                onClick={() => onSignIn('github')}
            >
                {loading === 'github' ? (
                    <span className='qaap-login-btn-icon-slot'>
                        <span className='qaap-login-spinner' aria-hidden={true} />
                    </span>
                ) : (
                    <GitHubIcon />
                )}
                <span className='qaap-login-btn-label'>
                    {loading === 'github' ? 'Authorizing…' : 'Continue with GitHub'}
                </span>
            </button>

            <button
                type='button'
                id='qaap-login-gitlab'
                className={`qaap-login-btn qaap-login-btn--secondary${loading === 'gitlab' ? ' qaap-login-btn--loading' : ''}`}
                disabled={loading !== undefined}
                aria-label='Continue with GitLab'
                aria-busy={loading === 'gitlab'}
                onClick={() => onSignIn('gitlab')}
            >
                {loading === 'gitlab' ? (
                    <span className='qaap-login-btn-icon-slot'>
                        <span className='qaap-login-spinner' aria-hidden={true} />
                    </span>
                ) : (
                    <GitLabIcon />
                )}
                <span className='qaap-login-btn-label'>
                    {loading === 'gitlab' ? 'Authorizing…' : 'Continue with GitLab'}
                </span>
            </button>
        </div>

        <footer className='qaap-login-footer'>
            By continuing you agree to the <a href='#' onClick={e => e.preventDefault()}>terms</a>
            {' '}&amp;{' '}
            <a href='#' onClick={e => e.preventDefault()}>privacy</a>.
            <br />
            {appName} never reads your repos without permission.
        </footer>
    </div>
);
