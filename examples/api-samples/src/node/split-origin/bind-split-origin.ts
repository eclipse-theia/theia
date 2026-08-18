// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { BackendApplicationContribution, BackendApplicationServer } from '@theia/core/lib/node';
import { BrowserConnectionTokenBackendContribution } from '@theia/core/lib/node/hosting/browser-connection-token';
import { SplitOriginBackendApplicationServer } from './split-origin-backend-application-server';
import { SplitOriginCorsContribution } from './split-origin-cors-contribution';
import { SplitOriginConnectionTokenBackendContribution } from './split-origin-connection-token';
import { SplitOriginMiniBrowserGuard } from './split-origin-mini-browser-guard';

export function bindSplitOriginBackend(bind: interfaces.Bind, rebind: interfaces.Rebind, isBound: interfaces.IsBound): void {
    const enabled = process.env.THEIA_SPLIT_ORIGIN;
    if (enabled !== '1' && enabled !== 'true') {
        return;
    }
    bind(SplitOriginBackendApplicationServer).toSelf().inSingletonScope();
    if (isBound(BackendApplicationServer)) {
        rebind(BackendApplicationServer).toService(SplitOriginBackendApplicationServer);
    } else {
        bind(BackendApplicationServer).toService(SplitOriginBackendApplicationServer);
    }

    bind(SplitOriginCorsContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(SplitOriginCorsContribution);

    bind(SplitOriginMiniBrowserGuard).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(SplitOriginMiniBrowserGuard);

    rebind(BrowserConnectionTokenBackendContribution).to(SplitOriginConnectionTokenBackendContribution).inSingletonScope();
}
