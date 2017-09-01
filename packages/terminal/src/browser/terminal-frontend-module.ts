/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify'
import { CommandContribution, MenuContribution, KeybindingContribution } from '@theia/core/lib/common';
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { TerminalWidget, TerminalWidgetFactory, TerminalWidgetOptions } from './terminal-widget';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { ITerminalServer, terminalPath } from '../common/terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';

import '../../src/browser/terminal.css';
import 'xterm/dist/xterm.css';

export default new ContainerModule(bind => {
    bind(TerminalWidget).toSelf().inTransientScope();
    bind(TerminalWatcher).toSelf().inSingletonScope();
    bind(TerminalWidgetFactory).toFactory(ctx =>
        (options: TerminalWidgetOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(TerminalWidgetOptions).toConstantValue(options);
            return child.get(TerminalWidget);
        }
    );

    bind(TerminalFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(TerminalFrontendContribution)
        ).inSingletonScope();
    }

    bind(ITerminalServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const terminalWatcher = ctx.container.get(TerminalWatcher);
        return connection.createProxy<ITerminalServer>(terminalPath, terminalWatcher.getTerminalClient());
    }).inSingletonScope();
});
