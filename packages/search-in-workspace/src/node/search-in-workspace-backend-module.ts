/*
 * Copyright (C) 2017-2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common";
import { SearchInWorkspaceServer, SearchInWorkspaceClient } from "../common/search-in-workspace-interface";
import { RipgrepSearchInWorkspaceServer } from "./ripgrep-search-in-workspace-server";

export default new ContainerModule(bind => {
    bind(SearchInWorkspaceServer).to(RipgrepSearchInWorkspaceServer);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<SearchInWorkspaceClient>
            ('/search-in-workspace', client => {
                const server = ctx.container.get<SearchInWorkspaceServer>(SearchInWorkspaceServer);
                server.setClient(client);
                client.onDidCloseConnection(() => server.dispose());
                return server;
            })
    );
});
