// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { RequestService } from '@theia/core/shared/@theia/request-service';
import { OVSXClient } from '@theia/ovsx-client';
import { VSXEnvironment } from './vsx-environment';

export const OVSXClientProvider = Symbol('OVSXClientProvider');
export type OVSXClientProvider = () => Promise<OVSXClient>;

export async function createOVSXClient(vsxEnvironment: VSXEnvironment, requestService: RequestService): Promise<OVSXClient> {
    const [apiVersion, apiUrl] = await Promise.all([
        vsxEnvironment.getVscodeApiVersion(),
        vsxEnvironment.getRegistryApiUri()
    ]);
    return new OVSXClient({ apiVersion, apiUrl: apiUrl.toString() }, requestService);
}
