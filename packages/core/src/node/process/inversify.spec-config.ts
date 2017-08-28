/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Container } from 'inversify';
import { loggerBackendModule } from '../logger-backend-module';
import { processBackendModule } from './process-backend-module';

let testContainer = new Container();

testContainer.load(loggerBackendModule);
testContainer.load(processBackendModule);

export { testContainer };
