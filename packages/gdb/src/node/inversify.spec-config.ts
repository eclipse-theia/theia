/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Container } from 'inversify';
import workspace from '@theia/workspace/lib/node/workspace-backend-module';
import filesystem from '@theia/filesystem/lib/node/filesystem-backend-module';
import preferenceBackendModule from '@theia/preferences/lib/node/preference-backend-module';
import debugBackendModule from '@theia/debug/lib/node/debug-backend-module';
import gdbBackendModule from './gdb-backend-module';
import { loggerBackendModule } from '@theia/core/lib/node/logger-backend-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';

const testContainer = new Container();

testContainer.load(processBackendModule);
testContainer.load(workspace);
testContainer.load(filesystem);
testContainer.load(preferenceBackendModule);
testContainer.load(debugBackendModule);
testContainer.load(gdbBackendModule);
testContainer.load(loggerBackendModule);
export { testContainer };
