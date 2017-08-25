/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Container } from 'inversify';
import { loggerBackendModule } from '@theia/core/lib/node/logger-backend-module';
import { backendApplicationModule } from '@theia/core/lib/node/backend-application-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';
import terminalBackendModule from '@theia/terminal/lib/node/terminal-backend-module';
import taskBackendModule from '../task-backend-module';
import filesystemBackendModule from '@theia/filesystem/lib/node/filesystem-backend-module';
import workspaceServer from '@theia/workspace/lib/node/workspace-backend-module';

const testContainer = new Container();

testContainer.load(backendApplicationModule);
testContainer.load(loggerBackendModule);
testContainer.load(processBackendModule);
testContainer.load(taskBackendModule);
testContainer.load(filesystemBackendModule);
testContainer.load(workspaceServer);
testContainer.load(terminalBackendModule);

export { testContainer };
