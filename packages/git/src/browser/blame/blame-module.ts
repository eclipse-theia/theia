/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from 'inversify';
import { FrontendApplicationContribution, KeybindingContribution } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { BlameContribution } from './blame-contribution';
import { BlameDecorator } from './blame-decorator';
import { BlameManager } from './blame-manager';

export function bindBlame(bind: interfaces.Bind) {
    bind(BlameContribution).toSelf().inSingletonScope();
    bind(BlameManager).toSelf().inSingletonScope();
    bind(BlameDecorator).toSelf().inSingletonScope();
    for (const serviceIdentifier of [FrontendApplicationContribution, CommandContribution, KeybindingContribution, MenuContribution]) {
        bind(serviceIdentifier).toService(BlameContribution);
    }
}
