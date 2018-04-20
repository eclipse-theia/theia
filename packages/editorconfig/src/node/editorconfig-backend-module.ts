/*
 * Copyright (C) 2018 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common";
import { EditorconfigService, editorconfigServicePath } from "../common/editorconfig-interface";
import { EditorconfigServiceImpl } from "./editorconfig-service-impl";

export default new ContainerModule(bind => {
    bind(EditorconfigService).to(EditorconfigServiceImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(editorconfigServicePath, () =>
            ctx.container.get(EditorconfigService)
        )
    ).inSingletonScope();
});
