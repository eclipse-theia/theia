// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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
import { injectable } from '@theia/core/shared/inversify';
import { OVSX_RATE_LIMIT, OVSXRouterConfig } from '@theia/ovsx-client';
import { VSCODE_DEFAULT_API_VERSION } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-types';
import { VSXEnvironment } from '../common/vsx-environment';

/**
 * Same defaults as `VSXEnvironmentImpl` when nothing is configured. There's no backend to ask in a
 * browser-only app, and `VSXExtension` looks up the registry URI eagerly, so without this every
 * extension logs a failed RPC call. Rebind it to use a different registry.
 */
@injectable()
export class BrowserOnlyVSXEnvironment implements VSXEnvironment {

    protected readonly registryUri = new URI('https://open-vsx.org');

    async getRateLimit(): Promise<number> {
        return OVSX_RATE_LIMIT;
    }

    async getRegistryUri(): Promise<string> {
        return this.registryUri.toString(true);
    }

    async getRegistryApiUri(): Promise<string> {
        return this.registryUri.resolve('api').toString(true);
    }

    async getVscodeApiVersion(): Promise<string> {
        return VSCODE_DEFAULT_API_VERSION;
    }

    async getOvsxRouterConfig(): Promise<OVSXRouterConfig | undefined> {
        return undefined;
    }
}
