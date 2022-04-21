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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';

import { createHttpPatch, createProxyResolver, createTlsPatch, ProxySupportSetting } from 'vscode-proxy-agent';
import { PreferenceRegistryExtImpl } from '../../plugin/preference-registry';

export function connectProxyResolver(configProvider: PreferenceRegistryExtImpl): void {
    const resolveProxy = createProxyResolver({
        resolveProxy: async url => url,
        getHttpProxySetting: () => configProvider.getConfiguration('http').get('proxy'),
        log: () => { },
        getLogLevel: () => 0,
        proxyResolveTelemetry: () => { },
        useHostProxy: true,
        env: process.env,
    });
    const lookup = createPatchedModules(configProvider, resolveProxy);
    configureModuleLoading(lookup);
}

interface PatchedModules {
    http: typeof http;
    https: typeof https;
    tls: typeof tls;
}

function createPatchedModules(configProvider: PreferenceRegistryExtImpl, resolveProxy: ReturnType<typeof createProxyResolver>): PatchedModules {
    const proxySetting = {
        config: 'off' as ProxySupportSetting
    };
    const certSetting = {
        config: false
    };
    configProvider.onDidChangeConfiguration(() => {
        const httpConfig = configProvider.getConfiguration('http');
        proxySetting.config = httpConfig?.get<ProxySupportSetting>('proxySupport') || 'off';
        certSetting.config = !!httpConfig?.get<boolean>('systemCertificates');
    });

    return {
        http: Object.assign(http, createHttpPatch(http, resolveProxy, proxySetting, certSetting, true)),
        https: Object.assign(https, createHttpPatch(https, resolveProxy, proxySetting, certSetting, true)),
        tls: Object.assign(tls, createTlsPatch(tls))
    };
}

function configureModuleLoading(lookup: PatchedModules): void {
    const node_module = require('module');
    const original = node_module._load;
    node_module._load = function (request: string): typeof tls | typeof http | typeof https {
        if (request === 'tls') {
            return lookup.tls;
        }

        if (request !== 'http' && request !== 'https') {
            return original.apply(this, arguments);
        }

        // Create a shallow copy of the http(s) module to work around extensions that apply changes to the modules
        // See for more info: https://github.com/microsoft/vscode/issues/93167
        return { ...lookup[request] };
    };
}
