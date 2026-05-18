// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import type { QaapAuthSessionUser } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

export interface QaapGithubStoredSession {
    accessToken: string;
    user: QaapAuthSessionUser;
}

@injectable()
export class QaapGithubSessionStore {

    protected readonly sessions = new Map<string, QaapGithubStoredSession>();
    protected readonly oauthStates = new Map<string, number>();

    createSession(data: QaapGithubStoredSession): string {
        const id = crypto.randomUUID();
        this.sessions.set(id, data);
        return id;
    }

    getSession(sessionId: string | undefined): QaapGithubStoredSession | undefined {
        if (!sessionId) {
            return undefined;
        }
        return this.sessions.get(sessionId);
    }

    deleteSession(sessionId: string | undefined): void {
        if (sessionId) {
            this.sessions.delete(sessionId);
        }
    }

    createOAuthState(): string {
        const state = crypto.randomUUID();
        this.oauthStates.set(state, Date.now());
        this.pruneOAuthStates();
        return state;
    }

    consumeOAuthState(state: string | undefined): boolean {
        if (!state || !this.oauthStates.has(state)) {
            return false;
        }
        this.oauthStates.delete(state);
        return true;
    }

    protected pruneOAuthStates(): void {
        const maxAgeMs = 10 * 60 * 1000;
        const now = Date.now();
        for (const [state, created] of this.oauthStates.entries()) {
            if (now - created > maxAgeMs) {
                this.oauthStates.delete(state);
            }
        }
    }
}
