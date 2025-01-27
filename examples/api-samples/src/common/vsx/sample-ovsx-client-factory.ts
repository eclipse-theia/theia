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

import { interfaces } from '@theia/core/shared/inversify';
import { OVSXUrlResolver } from '@theia/vsx-registry/lib/common';
import { SampleAppInfo } from './sample-app-info';

export function rebindOVSXClientFactory(rebind: interfaces.Rebind): void {
    // rebind the OVSX client factory so that we can replace patterns like "${self}" in the configs:
    rebind(OVSXUrlResolver)
        .toDynamicValue(ctx => {
            const appInfo = ctx.container.get<SampleAppInfo>(SampleAppInfo);
            const selfOrigin = appInfo.getSelfOrigin();
            return async (url: string) => url.replace('${self}', await selfOrigin);
        })
        .inSingletonScope();
}
