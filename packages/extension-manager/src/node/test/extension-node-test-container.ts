/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from "inversify";
import { ConsoleLoggerServer } from "@theia/core/lib/common/console-logger-server";
import { ILoggerServer } from "@theia/core/lib/common/logger-protocol";
import { stubRemoteMasterProcessFactory } from "@theia/core/lib/node";
import { bindServerProcess } from "@theia/core/lib/node/backend-application-module";
import { bindLogger } from "@theia/core/lib/node/logger-backend-module";
import { bindFileSystem } from "@theia/filesystem/lib/node/filesystem-backend-module";
import { FileSystemWatcherServer } from "@theia/filesystem/lib/common/filesystem-watcher-protocol";
import { NsfwFileSystemWatcherServer } from "@theia/filesystem/lib/node/nsfw-watcher/nsfw-filesystem-watcher";
import { ApplicationProjectArgs } from "../application-project-cli";
import { bindNodeExtensionServer } from '../extension-backend-module';

export const extensionNodeTestContainer = (args: ApplicationProjectArgs) => {
    const container = new Container();
    const bind = container.bind.bind(container);
    bindLogger(bind);
    bindServerProcess(bind, stubRemoteMasterProcessFactory);
    container.rebind(ILoggerServer).to(ConsoleLoggerServer).inSingletonScope();
    bindFileSystem(bind);
    bind(FileSystemWatcherServer).toConstantValue(new NsfwFileSystemWatcherServer());
    bindNodeExtensionServer(bind, args);
    return container;
};
export default extensionNodeTestContainer;
