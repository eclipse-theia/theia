/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Container } from 'inversify';
import debugBackendModule from '@theia/debug/lib/node/debug-backend-module'
import gdbBackendModule from './gdb-backend-module';
import { loggerBackendModule } from '@theia/core/lib/node/logger-backend-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';

const testContainer = new Container();

testContainer.load(processBackendModule);
testContainer.load(debugBackendModule);
testContainer.load(gdbBackendModule);
testContainer.load(loggerBackendModule);
export { testContainer };
