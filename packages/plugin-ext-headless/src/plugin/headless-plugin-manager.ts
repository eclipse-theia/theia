// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { AbstractPluginManagerExtImpl } from '@theia/plugin-ext/lib/plugin/plugin-manager';
import { HeadlessPluginManagerExt, HeadlessPluginManagerInitializeParams } from '../common/headless-plugin-rpc';
import { Plugin } from '@theia/plugin-ext';

@injectable()
export class HeadlessPluginManagerExtImpl extends AbstractPluginManagerExtImpl<HeadlessPluginManagerInitializeParams> implements HeadlessPluginManagerExt {

    private readonly supportedActivationEvents = new Set<string>();

    async $init(params: HeadlessPluginManagerInitializeParams): Promise<void> {
        params.activationEvents?.forEach(event => this.supportedActivationEvents.add(event));

        this.storage.init(params.globalState, {});

        this.envExt.setLanguage(params.env.language);
        this.envExt.setApplicationName(params.env.appName);
        this.envExt.setAppHost(params.env.appHost);

        if (params.extApi) {
            this.host.initExtApi(params.extApi);
        }
    }

    protected override getActivationEvents(plugin: Plugin): string[] | undefined {
        const result = plugin.rawModel?.headless?.activationEvents;
        return Array.isArray(result) ? result : undefined;
    }

    protected isSupportedActivationEvent(activationEvent: string): boolean {
        return this.supportedActivationEvents.has(activationEvent.split(':')[0]);
    }

}
