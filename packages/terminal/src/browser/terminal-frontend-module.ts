/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { KeybindingContribution, WebSocketConnectionProvider, WidgetFactory, KeybindingContext } from '@theia/core/lib/browser';
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { TerminalWidget, TerminalWidgetOptions, TERMINAL_WIDGET_FACTORY_ID } from './terminal-widget';
import { ITerminalServer, terminalPath, terminalsPath } from '../common/terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { IShellTerminalServer, shellTerminalPath } from '../common/shell-terminal-protocol';
import { TerminalActiveContext } from './terminal-keybinding-contexts';
import { createCommonBindings } from '../common/terminal-common-module';

import '../../src/browser/terminal.css';
import 'xterm/lib/xterm.css';

export default new ContainerModule(bind => {
    bind(KeybindingContext).to(TerminalActiveContext).inSingletonScope();

    bind(TerminalWidget).toSelf().inTransientScope();
    bind(TerminalWatcher).toSelf().inSingletonScope();

    let terminalNum = 0;
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: TERMINAL_WIDGET_FACTORY_ID,
        createWidget: (options: TerminalWidgetOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            const counter = terminalNum++;
            child.bind(TerminalWidgetOptions).toConstantValue({
                endpoint: { path: terminalsPath },
                id: 'terminal-' + counter,
                caption: 'Terminal ' + counter,
                label: 'Terminal ' + counter,
                destroyTermOnClose: true,
                ...options
            });
            return child.get(TerminalWidget);
        }
    }));

    bind(TerminalFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(identifier).toService(TerminalFrontendContribution);
    }

    bind(ITerminalServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const terminalWatcher = ctx.container.get(TerminalWatcher);
        return connection.createProxy<ITerminalServer>(terminalPath, terminalWatcher.getTerminalClient());
    }).inSingletonScope();

    bind(IShellTerminalServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const terminalWatcher = ctx.container.get(TerminalWatcher);
        return connection.createProxy<ITerminalServer>(shellTerminalPath, terminalWatcher.getTerminalClient());
    }).inSingletonScope();

    createCommonBindings(bind);
});
