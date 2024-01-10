// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { environment } from '@theia/core/lib/common';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { BackendApplicationCliContribution, BackendApplicationContribution } from '@theia/core/lib/node';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as net from 'net';
import { SampleAppInfo } from '../common/vsx/sample-app-info';

@injectable()
export class SampleBackendAppInfo implements SampleAppInfo, BackendApplicationContribution {

    protected addressDeferred = new Deferred<net.AddressInfo>();

    @inject(BackendApplicationCliContribution)
    protected backendCli: BackendApplicationCliContribution;

    onStart(server: net.Server): void {
        const address = server.address();
        // eslint-disable-next-line no-null/no-null
        if (typeof address === 'object' && address !== null) {
            this.addressDeferred.resolve(address);
        } else {
            this.addressDeferred.resolve({
                address: '127.0.0.1',
                port: 3000,
                family: '4'
            });
        }
    }

    async getSelfOrigin(): Promise<string> {
        const { ssl } = this.backendCli;
        const protocol = ssl ? 'https' : 'http';
        const { address, port } = await this.addressDeferred.promise;
        const hostname = environment.electron.is() ? 'localhost' : address;
        return `${protocol}://${hostname}:${port}`;
    }
}
