/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { FrontendApplicationContribution } from '../../application/browser/application';
import { WorkspaceFrontendContribution } from "./workspace-frontend-contribution";
import { FileDialogFactory, createFileDialog } from './file-dialog';

export const workspaceFrontendModule = new ContainerModule(bind => {
    bind(WorkspaceFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(ctx =>
        ctx.container.get(WorkspaceFrontendContribution)
    ).inSingletonScope();

    bind(FileDialogFactory).toFactory(ctx =>
        (title: string) =>
            createFileDialog(ctx.container, title)
    );
});