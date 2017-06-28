/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify'
import { CommandContribution, MenuContribution } from '../../application/common';
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { TerminalWidget, TerminalWidgetFactory } from './terminal-widget';

import 'theia-core/src/terminal/browser/terminal.css';
import 'xterm/dist/xterm.css';

export default new ContainerModule(bind => {
    bind(TerminalWidget).toSelf().inTransientScope();
    bind(TerminalWidgetFactory).toAutoFactory(TerminalWidget);

    bind(TerminalFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(TerminalFrontendContribution)
        ).inSingletonScope();
    }
});