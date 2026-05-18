// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const QAAP_AUTH_SIGNED_IN_KEY = 'qaap.auth.signedIn';
export const QAAP_AUTH_PROVIDER_KEY = 'qaap.auth.provider';
export const QAAP_AUTH_USER_KEY = 'qaap.auth.user';
export const QAAP_AUTH_SESSION_ID_KEY = 'qaap.auth.sessionId';

export type QaapAuthProvider = 'github' | 'gitlab';

export interface QaapAuthUser {
    provider: QaapAuthProvider;
    login: string;
    name: string;
    avatarUrl?: string;
}

/** Mirrors {@link LocalStorageService} key prefix (browser vs electron). */
export function qaapAuthStoragePrefix(): string {
    const electron = typeof window !== 'undefined'
        && typeof (window as Window & { electronTheiaCore?: unknown }).electronTheiaCore !== 'undefined';
    if (electron) {
        return 'theia:';
    }
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    return `theia:${pathname}:`;
}

export function qaapAuthStorageKey(suffix: string): string {
    return `${qaapAuthStoragePrefix()}${suffix}`;
}

/** True if any pathname variant has a stored Qaap sign-in flag. */
export function readQaapSignedIn(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
        return false;
    }
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key?.includes(QAAP_AUTH_SIGNED_IN_KEY)) {
                continue;
            }
            const raw = window.localStorage.getItem(key);
            if (raw === null) {
                continue;
            }
            const value = JSON.parse(raw) as boolean | string;
            if (value === true || value === 'true') {
                return true;
            }
        }
    } catch {
        return false;
    }
    return false;
}

export function readQaapAuthProvider(): QaapAuthProvider | undefined {
    if (typeof window === 'undefined' || !window.localStorage) {
        return undefined;
    }
    try {
        const raw = window.localStorage.getItem(qaapAuthStorageKey(QAAP_AUTH_PROVIDER_KEY));
        if (raw === null) {
            return undefined;
        }
        const value = JSON.parse(raw) as QaapAuthProvider;
        return value === 'github' || value === 'gitlab' ? value : undefined;
    } catch {
        return undefined;
    }
}

export function readQaapAuthUser(): QaapAuthUser | undefined {
    if (!readQaapSignedIn()) {
        return undefined;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const raw = window.localStorage.getItem(qaapAuthStorageKey(QAAP_AUTH_USER_KEY));
            if (raw !== null) {
                const parsed = JSON.parse(raw) as QaapAuthUser;
                if (parsed && (parsed.provider === 'github' || parsed.provider === 'gitlab') && parsed.login) {
                    return parsed;
                }
            }
        } catch {
            /* fall through */
        }
    }
    const provider = readQaapAuthProvider();
    return provider ? placeholderQaapAuthUser(provider) : undefined;
}

/** Placeholder profile until real OAuth returns GitHub/GitLab user metadata. */
export function placeholderQaapAuthUser(provider: QaapAuthProvider): QaapAuthUser {
    if (provider === 'gitlab') {
        return {
            provider: 'gitlab',
            login: 'gitlab-user',
            name: 'GitLab',
        };
    }
    return {
        provider: 'github',
        login: 'github-user',
        name: 'GitHub',
    };
}

export function readQaapAuthSessionId(): string | undefined {
    if (typeof window === 'undefined' || !window.localStorage) {
        return undefined;
    }
    try {
        const raw = window.localStorage.getItem(qaapAuthStorageKey(QAAP_AUTH_SESSION_ID_KEY));
        if (raw === null) {
            return undefined;
        }
        const value = JSON.parse(raw) as string;
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    } catch {
        return undefined;
    }
}

export function writeQaapAuthSession(provider: QaapAuthProvider, user?: QaapAuthUser, sessionId?: string): void {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }
    const profile = user ?? placeholderQaapAuthUser(provider);
    window.localStorage.setItem(qaapAuthStorageKey(QAAP_AUTH_SIGNED_IN_KEY), JSON.stringify(true));
    window.localStorage.setItem(qaapAuthStorageKey(QAAP_AUTH_PROVIDER_KEY), JSON.stringify(provider));
    window.localStorage.setItem(qaapAuthStorageKey(QAAP_AUTH_USER_KEY), JSON.stringify(profile));
    if (sessionId) {
        window.localStorage.setItem(qaapAuthStorageKey(QAAP_AUTH_SESSION_ID_KEY), JSON.stringify(sessionId));
    }
    window.dispatchEvent(new CustomEvent('qaap-auth-session-changed'));
}

/** @deprecated Use {@link writeQaapAuthSession}. */
export function writeQaapSignedIn(provider: QaapAuthProvider): void {
    writeQaapAuthSession(provider);
}

export function clearQaapAuthSession(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (key.includes('qaap.auth') || key.endsWith(QAAP_AUTH_SIGNED_IN_KEY) || key.endsWith(QAAP_AUTH_PROVIDER_KEY) || key.endsWith(QAAP_AUTH_USER_KEY))) {
            keysToRemove.push(key);
        }
    }
    for (const key of keysToRemove) {
        window.localStorage.removeItem(key);
    }
    window.dispatchEvent(new CustomEvent('qaap-auth-session-changed'));
}

export function qaapAuthUserInitials(user: QaapAuthUser): string {
    const source = user.name.trim() || user.login.trim();
    if (!source) {
        return '?';
    }
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
}
