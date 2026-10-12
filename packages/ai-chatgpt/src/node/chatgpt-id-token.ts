// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { createPublicKey, JsonWebKey, verify } from 'crypto';
import { createProxyFetch, getProxyUrl } from '@theia/ai-core/lib/node';

export const CHATGPT_ISSUER = 'https://auth.openai.com';
const DISCOVERY_URL = `${CHATGPT_ISSUER}/.well-known/openid-configuration`;

export interface VerifiedChatGptIdentity {
    subject: string;
    email?: string;
    name?: string;
}

interface TrustedDiscovery {
    jwksUri: string;
    revocationEndpoint?: string;
}

interface SigningKey extends JsonWebKey {
    kid?: string;
    use?: string;
    alg?: string;
}

/** Only issuer discovery determines key URLs; token-controlled jku/x5u headers are never followed. */
export class ChatGptIdTokenVerifier {
    protected keys: Promise<SigningKey[]> | undefined;
    protected discovery: Promise<TrustedDiscovery> | undefined;

    async getRevocationEndpoint(): Promise<string | undefined> {
        return (await this.getDiscovery()).revocationEndpoint;
    }

    async verify(token: string, clientId: string, nonce?: string): Promise<VerifiedChatGptIdentity> {
        try {
            const parts = token.split('.');
            if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) {
                throw new Error();
            }
            const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
            const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit !== undefined) {
                throw new Error();
            }
            const matches = (keys: SigningKey[]): SigningKey[] => keys.filter(key => key.kid === header.kid && key.kty === 'RSA'
                && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
            let matching = matches(await this.getKeys());
            if (!matching.length) {
                // OpenAI may rotate its signing keys while this backend is running.
                this.keys = undefined;
                this.discovery = undefined;
                matching = matches(await this.getKeys());
            }
            if (matching.length !== 1) {
                throw new Error();
            }
            const publicKey = createPublicKey({ key: matching[0], format: 'jwk' });
            if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'))) {
                throw new Error();
            }
            const now = Date.now() / 1000;
            const audienceMatches = claims.aud === clientId || (Array.isArray(claims.aud) && claims.aud.includes(clientId)
                && (claims.aud.length === 1 || claims.azp === clientId));
            if (claims.iss !== CHATGPT_ISSUER || !audienceMatches || (claims.azp !== undefined && claims.azp !== clientId)
                || !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat)
                || claims.iat > now + 60 || claims.iat >= claims.exp
                || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 60))
                || typeof claims.sub !== 'string' || !claims.sub.trim()
                || (nonce !== undefined && claims.nonce !== nonce)) {
                throw new Error();
            }
            return {
                subject: claims.sub,
                email: typeof claims.email === 'string' ? claims.email : undefined,
                name: typeof claims.name === 'string' ? claims.name : undefined
            };
        } catch {
            throw new Error('The OpenAI ID token could not be verified. Please sign in again.');
        }
    }

    protected getKeys(): Promise<SigningKey[]> {
        if (!this.keys) {
            const request = this.loadKeys().catch(error => {
                if (this.keys === request) {
                    this.keys = undefined;
                    this.discovery = undefined;
                }
                throw error;
            });
            this.keys = request;
        }
        return this.keys;
    }

    protected getDiscovery(): Promise<TrustedDiscovery> {
        if (!this.discovery) {
            const request = this.loadDiscovery().catch(error => {
                if (this.discovery === request) {
                    this.discovery = undefined;
                }
                throw error;
            });
            this.discovery = request;
        }
        return this.discovery;
    }

    protected async loadDiscovery(): Promise<TrustedDiscovery> {
        const discovery = await this.readJson(DISCOVERY_URL) as { issuer?: string; jwks_uri?: unknown; revocation_endpoint?: unknown };
        if (discovery.issuer !== CHATGPT_ISSUER) {
            throw new Error('Invalid OpenAI discovery issuer.');
        }
        return {
            jwksUri: this.trustedEndpoint(discovery.jwks_uri),
            revocationEndpoint: discovery.revocation_endpoint === undefined ? undefined : this.trustedEndpoint(discovery.revocation_endpoint)
        };
    }

    protected trustedEndpoint(value: unknown): string {
        if (typeof value !== 'string') {
            throw new Error('Invalid OpenAI discovery endpoint.');
        }
        const url = new URL(value);
        if (url.origin !== CHATGPT_ISSUER || url.username || url.password || url.hash) {
            throw new Error('Invalid OpenAI discovery endpoint.');
        }
        return url.toString();
    }

    protected async loadKeys(): Promise<SigningKey[]> {
        const discovery = await this.getDiscovery();
        const jwks = await this.readJson(discovery.jwksUri) as { keys?: SigningKey[] };
        if (!Array.isArray(jwks.keys) || !jwks.keys.length) {
            throw new Error('Invalid OpenAI signing keys.');
        }
        return jwks.keys;
    }

    protected async readJson(url: string): Promise<unknown> {
        const proxyFetch = createProxyFetch(getProxyUrl(url)) ?? fetch;
        const response = await proxyFetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
        if (!response.ok) {
            throw new Error('Could not load OpenAI signing keys.');
        }
        return response.json();
    }
}
