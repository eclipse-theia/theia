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

import { MCPOAuthConfig } from './mcp-oauth';
import { MCPRegistryMetadata } from './mcp-server-manager';

interface BaseMCPServerPreferenceValue {
    autostart?: boolean;
    deferLoading?: boolean;
    /** Provenance link to an AI registry entry; written by `@theia/ai-registry`. */
    registryMetadata?: MCPRegistryMetadata;
}

interface LocalMCPServerPreferenceValue extends BaseMCPServerPreferenceValue {
    command: string;
    args?: string[];
    env?: { [key: string]: string };
}

interface RemoteMCPServerPreferenceValue extends BaseMCPServerPreferenceValue {
    serverUrl: string;
    serverAuthToken?: string;
    serverAuthTokenHeader?: string;
    headers?: { [key: string]: string };
    oauth?: MCPOAuthConfig;
}

export type MCPServersPreferenceValue = LocalMCPServerPreferenceValue | RemoteMCPServerPreferenceValue;

export interface MCPServersPreference {
    [name: string]: MCPServersPreferenceValue
}

export namespace MCPServersPreference {
    /** Type guard for a single MCP servers preference entry; shares the OAuth-aware validation rules. */
    export function isValue(obj: unknown): obj is MCPServersPreferenceValue {
        return isPreferenceValue(obj);
    }
}

function isPreferenceValue(obj: unknown): obj is MCPServersPreferenceValue {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const candidate = obj as Record<string, unknown>;
    const isLocal = 'command' in candidate;
    const isRemote = 'serverUrl' in candidate;
    if (isLocal === isRemote) {
        return false;
    }
    if (isLocal && 'oauth' in candidate && !isAbsentOAuth(candidate.oauth)) {
        return false;
    }
    if (isRemote && !isAbsentOAuth(candidate.oauth) && !!candidate.serverAuthToken) {
        return false;
    }
    return (!('command' in candidate) || typeof candidate.command === 'string') &&
        (!('args' in candidate) || Array.isArray(candidate.args) && candidate.args.every(arg => typeof arg === 'string')) &&
        (!('env' in candidate) || !!candidate.env && typeof candidate.env === 'object'
            && Object.values(candidate.env).every(value => typeof value === 'string')) &&
        (!('autostart' in candidate) || typeof candidate.autostart === 'boolean') &&
        (!('deferLoading' in candidate) || typeof candidate.deferLoading === 'boolean') &&
        (!('serverUrl' in candidate) || typeof candidate.serverUrl === 'string') &&
        (!('serverAuthToken' in candidate) || typeof candidate.serverAuthToken === 'string') &&
        (!('serverAuthTokenHeader' in candidate) || typeof candidate.serverAuthTokenHeader === 'string') &&
        (!('headers' in candidate) || !!candidate.headers && typeof candidate.headers === 'object'
            && Object.values(candidate.headers).every(value => typeof value === 'string')) &&
        (!('oauth' in candidate) || isAbsentOAuth(candidate.oauth) || isOAuthConfig(candidate.oauth)) &&
        (!('registryMetadata' in candidate) || isRegistryMetadata(candidate.registryMetadata));
}

function isAbsentOAuth(obj: unknown): boolean {
    // User-authored JSON can contain an explicit null; treat it like an absent OAuth field.
    // eslint-disable-next-line no-null/no-null
    return obj === undefined || obj === null;
}

function isOAuthConfig(obj: unknown): obj is MCPOAuthConfig {
    return !!obj && typeof obj === 'object' &&
        (!('clientId' in obj) || typeof obj.clientId === 'string') &&
        (!('scopes' in obj) || Array.isArray(obj.scopes) && obj.scopes.every(scope => typeof scope === 'string')) &&
        (!('authorizationServer' in obj) || typeof obj.authorizationServer === 'string' && isHttpOrHttpsUrl(obj.authorizationServer)) &&
        (!('resource' in obj) || typeof obj.resource === 'string' && isHttpOrHttpsUrl(obj.resource));
}

function isRegistryMetadata(obj: unknown): obj is MCPRegistryMetadata {
    return !!obj && typeof obj === 'object'
        && 'serverId' in obj && typeof obj.serverId === 'string'
        && (!('version' in obj) || typeof obj.version === 'string')
        && (!('configHash' in obj) || typeof obj.configHash === 'string');
}

/**
 * Returns `true` if `value` parses as a URL with an http(s) scheme.
 */
export function isHttpOrHttpsUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Returns a developer-facing English diagnostic for an invalid `MCPServersPreference` entry, or `undefined`
 * when the entry is valid. **Diagnostic only — do not surface to end users without localizing.**
 */
function describeInvalidReason(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
        return 'Expected a JSON object.';
    }
    const candidate = value as Record<string, unknown>;
    const isLocal = 'command' in candidate;
    const isRemote = 'serverUrl' in candidate;
    if (!isLocal && !isRemote) {
        return 'Either "command" (local) or "serverUrl" (remote) is required.';
    }
    if (isLocal && isRemote) {
        return 'Specify either "command" (local) or "serverUrl" (remote), not both.';
    }
    if (isLocal && 'oauth' in candidate && !isAbsentOAuth(candidate.oauth)) {
        return 'OAuth is only valid for remote MCP servers.';
    }
    if (isRemote && !!candidate.serverAuthToken && !isAbsentOAuth(candidate.oauth)) {
        return 'Configure either a static serverAuthToken or OAuth, not both.';
    }
    const fieldMismatch = describeFieldMismatch(candidate);
    if (fieldMismatch) {
        return fieldMismatch;
    }
    return undefined;
}

/** Diagnostic-only helper for {@link describeInvalidReason}; do not surface to end users without localizing. */
function describeFieldMismatch(candidate: Record<string, unknown>): string | undefined {
    if ('command' in candidate && typeof candidate.command !== 'string') {
        return 'Field "command" must be a string.';
    }
    if ('args' in candidate && !(Array.isArray(candidate.args) && candidate.args.every(arg => typeof arg === 'string'))) {
        return 'Field "args" must be an array of strings.';
    }
    if ('env' in candidate && !(!!candidate.env && typeof candidate.env === 'object'
        && Object.values(candidate.env).every(envValue => typeof envValue === 'string'))) {
        return 'Field "env" must be an object mapping strings to strings.';
    }
    if ('autostart' in candidate && typeof candidate.autostart !== 'boolean') {
        return 'Field "autostart" must be a boolean.';
    }
    if ('deferLoading' in candidate && typeof candidate.deferLoading !== 'boolean') {
        return 'Field "deferLoading" must be a boolean.';
    }
    if ('serverUrl' in candidate && typeof candidate.serverUrl !== 'string') {
        return 'Field "serverUrl" must be a string.';
    }
    if ('serverAuthToken' in candidate && typeof candidate.serverAuthToken !== 'string') {
        return 'Field "serverAuthToken" must be a string.';
    }
    if ('serverAuthTokenHeader' in candidate && typeof candidate.serverAuthTokenHeader !== 'string') {
        return 'Field "serverAuthTokenHeader" must be a string.';
    }
    if ('headers' in candidate && !(!!candidate.headers && typeof candidate.headers === 'object'
        && Object.values(candidate.headers).every(headerValue => typeof headerValue === 'string'))) {
        return 'Field "headers" must be an object mapping strings to strings.';
    }
    if ('oauth' in candidate && !isAbsentOAuth(candidate.oauth) && !isOAuthConfig(candidate.oauth)) {
        const oauthDetail = describeOAuthFieldMismatch(candidate.oauth);
        return oauthDetail ?? 'Field "oauth" must be an OAuth configuration object.';
    }
    if ('registryMetadata' in candidate && !isRegistryMetadata(candidate.registryMetadata)) {
        return 'Field "registryMetadata" must be an object with a string "serverId".';
    }
    return undefined;
}

/** Diagnostic-only helper for {@link describeFieldMismatch}; do not surface to end users without localizing. */
function describeOAuthFieldMismatch(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const candidate = value as Record<string, unknown>;
    if ('authorizationServer' in candidate
        && (typeof candidate.authorizationServer !== 'string' || !isHttpOrHttpsUrl(candidate.authorizationServer))) {
        return 'Field "oauth.authorizationServer" must be a parseable http(s) URL string.';
    }
    if ('resource' in candidate
        && (typeof candidate.resource !== 'string' || !isHttpOrHttpsUrl(candidate.resource))) {
        return 'Field "oauth.resource" must be a parseable http(s) URL string.';
    }
    return undefined;
}

export function filterValidValues(servers: unknown): MCPServersPreference {
    const result: MCPServersPreference = {};
    if (!servers || typeof servers !== 'object') {
        return result;
    }
    for (const [name, value] of Object.entries(servers)) {
        if (isPreferenceValue(value)) {
            result[name] = value;
        } else {
            const reason = describeInvalidReason(value);
            const message = `Ignoring invalid MCP server preference entry "${name}".`;
            if (reason) {
                console.warn(message, reason);
            } else {
                console.warn(message);
            }
        }
    }
    return result;
}
