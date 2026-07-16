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

import { bindRootContributionProvider, ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { EXTERNAL_API_CONFIG_SERVICE_PATH, ExternalApiConfigService } from '../common/external-api-configuration';
import { ExternalApiContribution } from './external-api-contribution';
import { ExternalApiEventStream, ExternalApiEventStreamFactory, ExternalApiEventStreamImpl, ExternalApiEventStreamOptions } from './external-api-event-stream';
import { ExternalApiResponseWriter } from './external-api-response-writer';
import { ExternalApiRouter, ExternalApiRouterFactory, ExternalApiRouterImpl, ExternalApiRouterOptions } from './external-api-router';
import { ExternalApiServer } from './external-api-server';
import { OpenApiDocumentBuilder, OpenApiDocumentBuilderImpl } from './openapi-document-builder';
import { OpenApiSpecContribution } from './openapi-spec-contribution';

export default new ContainerModule(bind => {
    bind(ExternalApiServer).toSelf().inSingletonScope();
    bind(ExternalApiConfigService).toService(ExternalApiServer);
    bind(BackendApplicationContribution).toService(ExternalApiServer);

    bind(OpenApiDocumentBuilder).to(OpenApiDocumentBuilderImpl).inSingletonScope();
    bind(OpenApiSpecContribution).toSelf().inSingletonScope();
    bind(ExternalApiContribution).toService(OpenApiSpecContribution);

    bind(ExternalApiResponseWriter).toSelf().inSingletonScope();
    // routers and event streams are transient: the factories create one per routing build,
    // resolving through a child container carrying the instantiation options
    bind(ExternalApiRouter).to(ExternalApiRouterImpl);
    bind(ExternalApiRouterFactory).toFactory(ctx => (options: ExternalApiRouterOptions): ExternalApiRouter => {
        const child = new Container();
        child.parent = ctx.container;
        child.bind(ExternalApiRouterOptions).toConstantValue(options);
        return child.get(ExternalApiRouter);
    });
    bind(ExternalApiEventStream).to(ExternalApiEventStreamImpl);
    bind(ExternalApiEventStreamFactory).toFactory(ctx => <T>(options: ExternalApiEventStreamOptions<T>): ExternalApiEventStream<T> => {
        const child = new Container();
        child.parent = ctx.container;
        child.bind(ExternalApiEventStreamOptions).toConstantValue(options);
        return child.get<ExternalApiEventStream<T>>(ExternalApiEventStream);
    });

    bindRootContributionProvider(bind, ExternalApiContribution);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(EXTERNAL_API_CONFIG_SERVICE_PATH, () =>
            ctx.container.get<ExternalApiConfigService>(ExternalApiConfigService)
        )
    ).inSingletonScope();
});
