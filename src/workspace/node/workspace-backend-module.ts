/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from '../../messaging/common';
import { WorkspaceServer, workspacePath } from "../common";
import { DefaultWorkspaceServer } from "./default-workspace-server";

export default new ContainerModule(bind => {
    bind(DefaultWorkspaceServer).toSelf().inSingletonScope();
    bind(WorkspaceServer).toDynamicValue(ctx =>
        ctx.container.get(DefaultWorkspaceServer)
    ).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(workspacePath, () =>
            ctx.container.get(WorkspaceServer)
        )
    ).inSingletonScope();
});