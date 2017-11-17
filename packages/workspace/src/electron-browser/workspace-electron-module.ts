/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces, ContainerModule } from 'inversify';
import { createContainerModule } from '../browser/workspace-frontend-module';
import { WindowHelper } from '../browser/window-helper';
import { ElectronWindowHelper } from './electron-window-helper';

const module: ContainerModule = createContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    rebind(WindowHelper).to(ElectronWindowHelper).inSingletonScope();
});
export default module;
