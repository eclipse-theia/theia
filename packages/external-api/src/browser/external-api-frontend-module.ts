// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { PreferenceContribution } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { ContainerModule } from '@theia/core/shared/inversify';
import { EXTERNAL_API_CONFIG_SERVICE_PATH, ExternalApiConfigService } from '../common/external-api-configuration';
import { createExternalApiPreferenceSchema } from '../common/external-api-preferences';
import { ExternalApiFrontendContribution } from './external-api-frontend-contribution';

export default new ContainerModule(bind => {
    // the frontend is served by the backend, so its location determines the backend port
    const backendPort = typeof location !== 'undefined' && location.port ? location.port : undefined;
    bind(PreferenceContribution).toConstantValue({ schema: createExternalApiPreferenceSchema(backendPort) });

    bind(ExternalApiConfigService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return connection.createProxy<ExternalApiConfigService>(EXTERNAL_API_CONFIG_SERVICE_PATH);
    }).inSingletonScope();

    bind(ExternalApiFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ExternalApiFrontendContribution);
});
