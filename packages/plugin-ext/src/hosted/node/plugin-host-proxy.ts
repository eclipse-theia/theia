/********************************************************************************
 * Copyright (C) 2022 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

// Default imports resolve to the real Node module objects. With `esModuleInterop`, a namespace
// import (`import * as http`) is a read-only copy with getter-only properties, and the
// `Object.assign(http, …)` patches below would throw "Cannot set property … which has only a getter".
import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';

import {
    createFetchPatch, createHttpPatch, createNetPatch, createProxyResolver, createTlsPatch, createWebSocketPatch,
    loadSystemCertificates, Log, LogLevel, patchUndici, ProxyAgentParams, ProxySupportSetting, ResolveProxyWithRequest
} from '@vscode/proxy-agent';
import { PreferenceRegistryExtImpl } from '../../plugin/preference-registry.js';
import { WorkspaceExtImpl } from '../../plugin/workspace.js';
import Module, { syncBuiltinESMExports } from 'node:module';

export interface ProxyAgentParamsOptions {
    /** Loads the CA certificates that are trusted in addition to Node's default ones. Defaults to the certificates of the operating system. */
    loadAdditionalCertificates?: () => Promise<string[]>;
}

const log: Log = {
    trace: () => { },
    debug: () => { },
    info: () => { },
    warn: (message, ...args) => console.warn(message, ...args),
    error: (message, ...args) => console.error(message, ...args)
};

/**
 * Creates the parameters of `@vscode/proxy-agent` from the `http.*` preferences.
 * The preferences are read on every request, so changes apply without a restart.
 */
export function createProxyAgentParams(
    workspaceExt: Pick<WorkspaceExtImpl, 'resolveProxy'>,
    configProvider: Pick<PreferenceRegistryExtImpl, 'getConfiguration'>,
    options: ProxyAgentParamsOptions = {}
): ProxyAgentParams {
    const get = <T>(key: string, defaultValue: T): T => {
        let configuration: ReturnType<typeof configProvider.getConfiguration>;
        try {
            configuration = configProvider.getConfiguration('http');
        } catch {
            // the preferences arrive when the plugin host is initialized; `createProxyResolver` may read them before, e.g. on macOS
            return defaultValue;
        }
        return configuration.get<T>(key) ?? defaultValue;
    };
    const systemCertificates = () => get('systemCertificates', true);
    return {
        resolveProxy: url => workspaceExt.resolveProxy(url),
        getProxyURL: () => get<string | undefined>('proxy', undefined) || undefined,
        getProxySupport: () => get<ProxySupportSetting>('proxySupport', 'override'),
        getNoProxyConfig: () => get<string[]>('noProxy', []),
        isAdditionalFetchSupportEnabled: () => get('fetchAdditionalSupport', true),
        isWebSocketPatchEnabled: () => true,
        addCertificatesV1: systemCertificates,
        addCertificatesV2: () => false,
        loadSystemCertificatesFromNode: () => true,
        loadAdditionalCertificates: options.loadAdditionalCertificates ?? (() => loadSystemCertificates({ loadSystemCertificatesFromNode: () => true, log })),
        log,
        getLogLevel: () => LogLevel.Warning,
        proxyResolveTelemetry: () => { },
        isUseHostProxyEnabled: () => true,
        env: process.env,
    };
}

export function connectProxyResolver(workspaceExt: WorkspaceExtImpl, configProvider: PreferenceRegistryExtImpl): void {
    const params = createProxyAgentParams(workspaceExt, configProvider);
    const { resolveProxyWithRequest, resolveProxyURL } = createProxyResolver(params);
    const lookup = createPatchedModules(params, resolveProxyWithRequest);
    globalThis.fetch = createFetchPatch(params, globalThis.fetch, resolveProxyURL);
    if (globalThis.WebSocket) {
        globalThis.WebSocket = createWebSocketPatch(params, globalThis.WebSocket, resolveProxyURL);
    }
    configureModuleLoading(lookup);
}

interface PatchedModules {
    http: typeof http;
    https: typeof https;
    net: typeof net;
    tls: typeof tls;
}

function createPatchedModules(params: ProxyAgentParams, resolveProxy: ResolveProxyWithRequest): PatchedModules {
    const patchedModules = {
        http: Object.assign(http, createHttpPatch(params, http, resolveProxy)),
        https: Object.assign(https, createHttpPatch(params, https, resolveProxy)),
        net: Object.assign(net, createNetPatch(params, net)),
        tls: Object.assign(tls, createTlsPatch(params, tls))
    };
    // Updates the named exports of the patched modules for ES modules, e.g. plugins that are ES modules.
    syncBuiltinESMExports();
    return patchedModules;
}

function configureModuleLoading(lookup: PatchedModules): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node_module: any = Module;
    const original = node_module._load;
    let undici: unknown;
    node_module._load = function (request: string): unknown {
        if (request === 'net' || request === 'tls') {
            return lookup[request];
        }

        if (request === 'undici') {
            // Lets the patched `fetch` reuse the options of the `Agent` and `ProxyAgent` instances that plugins pass to it.
            if (!undici) {
                undici = original.apply(this, arguments);
                patchUndici(undici as Parameters<typeof patchUndici>[0]);
            }
            return undici;
        }

        if (request !== 'http' && request !== 'https') {
            return original.apply(this, arguments);
        }

        // Create a shallow copy of the http(s) module to work around extensions that apply changes to the modules
        // See for more info: https://github.com/microsoft/vscode/issues/93167
        return { ...lookup[request] };
    };
}
