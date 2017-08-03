/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from "inversify";
import { bindLogger } from "@theia/core/lib/node/logger-backend-module";
import { ConsoleLoggerServer } from "@theia/core/lib/common/console-logger-server";
import { ILoggerServer } from "@theia/core/lib/common/logger-protocol";
import { bindFileSystem, bindFileSystemWatcherServer } from "@theia/filesystem/lib/node/filesystem-backend-module";
import { bindNodeExtensionServer, AppProjectArgs } from '../extension-backend-module';

export const extensionNodeTestContainer = (args: AppProjectArgs) => {
    const container = new Container();
    const bind = container.bind.bind(container);
    bindLogger(bind);
    container.rebind(ILoggerServer).to(ConsoleLoggerServer).inSingletonScope();
    bindFileSystem(bind);
    bindFileSystemWatcherServer(bind);
    bindNodeExtensionServer(bind, args);
    return container;
};
export default extensionNodeTestContainer;
