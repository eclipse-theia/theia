/*
 * Copyright (C) 2018 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { FrontendApplicationContribution, FrontendApplication, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { EditorconfigDocumentManager } from './editorconfig-document-manager';
import { EditorconfigService, editorconfigServicePath } from "../common/editorconfig-interface";
import { MaybePromise } from "@theia/core";

export default new ContainerModule((bind, unbind) => {
    bind(EditorconfigService).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<EditorconfigService>(editorconfigServicePath);
    }).inSingletonScope();

    bind(EditorconfigDocumentManager).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(ctx => ({
        onStart(app: FrontendApplication): MaybePromise<void> {
            ctx.container.get<EditorconfigDocumentManager>(EditorconfigDocumentManager);
        }
    }));
});
