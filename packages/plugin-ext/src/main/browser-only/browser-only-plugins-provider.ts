// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin
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
import { DeployedPlugin } from '../../common/plugin-protocol';
import { PLUGINS_BASE_PATH } from '@theia/core/lib/common/static-asset-paths';

/** Service that provides plugin data in browser-only mode (e.g. deployed plugin list; more methods may be added later). */
export const BrowserOnlyPluginsProvider = Symbol('BrowserOnlyPluginsProvider');
export interface BrowserOnlyPluginsProvider {
    getPlugins(): Promise<DeployedPlugin[]>;
}

@injectable()
export class BrowserOnlyPluginsProviderImpl implements BrowserOnlyPluginsProvider {
    private cached: Promise<DeployedPlugin[]> | undefined;

    async getPlugins(): Promise<DeployedPlugin[]> {
        if (this.cached === undefined) {
            this.cached = fetch(`${PLUGINS_BASE_PATH}/list.json`)
                .then(res => (res.ok ? res.json() : []))
                .catch(() => []);
        }

        return this.cached;
    }
}
