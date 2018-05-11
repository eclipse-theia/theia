/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { PluginDeployerFileHandler, PluginDeployerDirectoryHandler, PluginScanner } from "@theia/plugin-ext";
import { PluginVsCodeFileHandler } from "./plugin-vscode-file-handler";
import { PluginVsCodeDirectoryHandler } from "./plugin-vscode-directory-handler";
import { VsCodePluginScanner } from "./scanner-vscode";

export default new ContainerModule(bind => {
    bind(PluginDeployerFileHandler).to(PluginVsCodeFileHandler).inSingletonScope();
    bind(PluginDeployerDirectoryHandler).to(PluginVsCodeDirectoryHandler).inSingletonScope();
    bind(PluginScanner).to(VsCodePluginScanner).inSingletonScope();
}
);
