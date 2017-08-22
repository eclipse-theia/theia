/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Git } from '../common/git';
import { DugiteGit } from './dugite-git';
import { ContainerModule } from 'inversify';
import { bindGitPreferences } from '../common/git-preferences';

export default new ContainerModule(bind => {
    bindGitPreferences(bind);
    bind(Git).toDynamicValue(ctx => ctx.container.get(DugiteGit)).inSingletonScope();
});
