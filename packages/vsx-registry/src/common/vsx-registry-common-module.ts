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

import { ContainerModule } from '@theia/core/shared/inversify';
import { OVSXClientProvider, OVSXUrlResolver } from '../common';
import { RequestService } from '@theia/core/shared/@theia/request';
import { ExtensionIdMatchesFilterFactory, OVSXApiFilter, OVSXApiFilterImpl, OVSXClient, OVSXHttpClient, OVSXRouterClient, RequestContainsFilterFactory } from '@theia/ovsx-client';
import { VSXEnvironment } from './vsx-environment';

export default new ContainerModule(bind => {
    bind(OVSXUrlResolver)
        .toFunction(url => url);
    bind(OVSXClientProvider)
        .toDynamicValue(ctx => {
            const vsxEnvironment = ctx.container.get<VSXEnvironment>(VSXEnvironment);
            const requestService = ctx.container.get<RequestService>(RequestService);
            const urlResolver = ctx.container.get(OVSXUrlResolver);
            const clientPromise = Promise
                .all([
                    vsxEnvironment.getRegistryApiUri(),
                    vsxEnvironment.getOvsxRouterConfig?.(),
                ])
                .then<OVSXClient>(async ([apiUrl, ovsxRouterConfig]) => {
                    if (ovsxRouterConfig) {
                        const clientFactory = OVSXHttpClient.createClientFactory(requestService);
                        return OVSXRouterClient.FromConfig(
                            ovsxRouterConfig,
                            async url => clientFactory(await urlResolver(url)),
                            [RequestContainsFilterFactory, ExtensionIdMatchesFilterFactory]
                        );
                    }
                    return new OVSXHttpClient(
                        await urlResolver(apiUrl),
                        requestService
                    );
                });
            // reuse the promise for subsequent calls to this provider
            return () => clientPromise;
        })
        .inSingletonScope();
    bind(OVSXApiFilter)
        .toDynamicValue(ctx => {
            const vsxEnvironment = ctx.container.get<VSXEnvironment>(VSXEnvironment);
            const apiFilter = new OVSXApiFilterImpl('-- temporary invalid version value --');
            vsxEnvironment.getVscodeApiVersion()
                .then(apiVersion => apiFilter.supportedApiVersion = apiVersion);
            return apiFilter;
        })
        .inSingletonScope();
});
