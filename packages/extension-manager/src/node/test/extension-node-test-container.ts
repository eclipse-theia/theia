/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from "inversify";
import { bindLogger } from "@theia/core/lib/node/logger-backend-module";
import { bindFileSystem, bindFileSystemWatcherServer } from "@theia/filesystem/lib/node/filesystem-backend-module";
import { bindNodeExtensionServer } from '../extension-backend-module';

export default (appProjectPath: string) => {
    const container = new Container();
    const bind = container.bind.bind(container);
    bindLogger(bind);
    bindFileSystem(bind);
    bindFileSystemWatcherServer(bind);
    bindNodeExtensionServer(bind, appProjectPath);
    return container;
};
