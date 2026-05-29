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

import { MCPRegistryMetadata } from './mcp-server-manager';

/**
 * Shape and value-guard for the `ai-features.mcp.mcpServers` preference. Lives in
 * `common` so any consumer (browser-side contribution, registry view, future Node-side
 * tooling) can apply the same checks without pulling in DOM-touching modules.
 */

export interface BaseMCPServerPreferenceValue {
    autostart?: boolean;
    /** Provenance link to an AI registry entry; written by `@theia/ai-registry`. */
    registryMetadata?: MCPRegistryMetadata;
}

export interface LocalMCPServerPreferenceValue extends BaseMCPServerPreferenceValue {
    command: string;
    args?: string[];
    env?: { [key: string]: string };
}

export interface RemoteMCPServerPreferenceValue extends BaseMCPServerPreferenceValue {
    serverUrl: string;
    serverAuthToken?: string;
    serverAuthTokenHeader?: string;
    headers?: { [key: string]: string };
}

export type MCPServersPreferenceValue = LocalMCPServerPreferenceValue | RemoteMCPServerPreferenceValue;

export interface MCPServersPreference {
    [name: string]: MCPServersPreferenceValue
}

export namespace MCPServersPreference {
    export function isValue(obj: unknown): obj is MCPServersPreferenceValue {
        return !!obj && typeof obj === 'object' &&
            ('command' in obj || 'serverUrl' in obj) &&
            (!('command' in obj) || typeof obj.command === 'string') &&
            (!('args' in obj) || Array.isArray(obj.args) && obj.args.every(arg => typeof arg === 'string')) &&
            (!('env' in obj) || !!obj.env && typeof obj.env === 'object' && Object.values(obj.env).every(value => typeof value === 'string')) &&
            (!('autostart' in obj) || typeof obj.autostart === 'boolean') &&
            (!('serverUrl' in obj) || typeof obj.serverUrl === 'string') &&
            (!('serverAuthToken' in obj) || typeof obj.serverAuthToken === 'string') &&
            (!('serverAuthTokenHeader' in obj) || typeof obj.serverAuthTokenHeader === 'string') &&
            (!('headers' in obj) || !!obj.headers && typeof obj.headers === 'object' && Object.values(obj.headers).every(value => typeof value === 'string')) &&
            (!('registryMetadata' in obj) || isRegistryMetadata(obj.registryMetadata));
    }
}

function isRegistryMetadata(obj: unknown): obj is MCPRegistryMetadata {
    return !!obj && typeof obj === 'object'
        && 'serverId' in obj && typeof obj.serverId === 'string'
        && (!('version' in obj) || typeof obj.version === 'string')
        && (!('configHash' in obj) || typeof obj.configHash === 'string');
}

export function filterValidValues(servers: unknown): MCPServersPreference {
    const result: MCPServersPreference = {};
    if (!servers || typeof servers !== 'object') {
        return result;
    }
    for (const [name, value] of Object.entries(servers)) {
        if (typeof name === 'string' && MCPServersPreference.isValue(value)) {
            result[name] = value;
        }
    }
    return result;
}
