/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Container } from 'inversify';
import { loggerBackendModule } from '@theia/core/lib/node/logger-backend-module';
import searchWorkSpaceBackendModule from '../search-workspace-backend-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';
const { backendApplicationModule } = require('@theia/core/lib/node/backend-application-module');
import { IOutputParser, OutputParser } from "../../../../output-parser/lib/node/output-parser";

let testContainer = new Container();

testContainer.load(loggerBackendModule);
testContainer.load(searchWorkSpaceBackendModule);
testContainer.load(processBackendModule);
testContainer.load(backendApplicationModule);
testContainer.bind<OutputParser>(IOutputParser).to(OutputParser);

export { testContainer };
