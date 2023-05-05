// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Endpoint } from '@theia/core/lib/browser';

import { ElectronSecurityToken } from '@theia/core/lib/electron-common/electron-token';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MiniBrowserEnvironment } from '../../browser/environment/mini-browser-environment';

import '@theia/core/lib/electron-common/electron-api';

@injectable()
export class ElectronMiniBrowserEnvironment extends MiniBrowserEnvironment {

    @inject(ElectronSecurityToken)
    protected readonly electronSecurityToken: ElectronSecurityToken;

    override getEndpoint(uuid: string, hostname?: string): Endpoint {
        const endpoint = super.getEndpoint(uuid, hostname);

        window.electronTheiaCore.attachSecurityToken(endpoint.getRestUrl().toString(true));
        return endpoint;
    }

    protected override getDefaultHostname(): string {
        const query = self.location.search
            .substr(1) // remove leading `?`
            .split('&')
            .map(entry => entry
                .split('=', 2)
                .map(element => decodeURIComponent(element))
            );
        for (const [key, value] of query) {
            if (key === 'port') {
                return `localhost:${value}`;
            }
        }
        throw new Error('could not resolve Electron\'s backend port');
    }
}
