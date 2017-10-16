/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { IDebugSession, DebugSession } from './debug-session';
import { DebugSessionManager } from './debug-session-manager';

export default new ContainerModule(bind => {
    bind<IDebugSession>(IDebugSession).to(DebugSession).whenTargetIsDefault();
    bind<DebugSessionManager>(DebugSessionManager).toSelf().inSingletonScope();
});
