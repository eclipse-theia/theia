/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common";
import { ILogger } from '@theia/core/lib/common/logger';
import { RipGrepWorkSpace, RipGrepProcessOptions, RipGrepProcessFactory } from './ripgrep-workspace';
import { ISearchWorkSpaceServer, ISearchWorkSpaceClient, searchPath } from '../common/search-workspace-protocol';
import { SearchWorkSpaceServer } from '../common/search-workspace-server';
// import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { OutputParser } from "../../../output-parser/lib/node/output-parser";

export default new ContainerModule(bind => {
    // export const searchWorkSpaceBackendModule = new ContainerModule(bind => {
    bind(RipGrepWorkSpace).toSelf().inTransientScope();

    bind(ILogger).toDynamicValue(ctx => {
        const logger = ctx.container.get<ILogger>(ILogger);
        return logger.child({ 'module': 'ripgrepProcess' });
    }).inSingletonScope().whenTargetNamed("ripgrepProcess");

    bind(RipGrepProcessFactory).toFactory(ctx =>
        (options: RipGrepProcessOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(RipGrepProcessOptions).toConstantValue(options);
            return child.get(RipGrepWorkSpace);
        }
    );

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<ISearchWorkSpaceClient>(searchPath, client => {
            const searchServer = ctx.container.get<ISearchWorkSpaceServer>(ISearchWorkSpaceServer);
            searchServer.setClient(client);
            return searchServer;
        })
    ).inSingletonScope();
    bind(ISearchWorkSpaceServer).to(SearchWorkSpaceServer).inSingletonScope();
    bind(OutputParser).toSelf().inSingletonScope();

});
