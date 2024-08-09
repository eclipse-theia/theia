// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { OVSXRouterConfig } from '@theia/ovsx-client';
import { PluginVsCodeCliContribution } from '@theia/plugin-ext-vscode/lib/node/plugin-vscode-cli-contribution';
import { VSXEnvironment } from '../common/vsx-environment';
import { VsxCli } from './vsx-cli';

@injectable()
export class VSXEnvironmentImpl implements VSXEnvironment {

    protected _registryUri = new URI(process.env['VSX_REGISTRY_URL']?.trim() || 'https://open-vsx.org');

    @inject(PluginVsCodeCliContribution)
    protected readonly pluginVscodeCli: PluginVsCodeCliContribution;

    @inject(VsxCli)
    protected vsxCli: VsxCli;

    async getRateLimit(): Promise<number> {
        return this.vsxCli.ovsxRateLimit;
    }

    async getRegistryUri(): Promise<string> {
        return this._registryUri.toString(true);
    }

    async getRegistryApiUri(): Promise<string> {
        return this._registryUri.resolve('api').toString(true);
    }

    async getVscodeApiVersion(): Promise<string> {
        return this.pluginVscodeCli.vsCodeApiVersionPromise;
    }

    async getOvsxRouterConfig(): Promise<OVSXRouterConfig | undefined> {
        return this.vsxCli.ovsxRouterConfig;
    }
}
