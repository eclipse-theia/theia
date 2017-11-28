/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify';
import { CommandContribution, MenuContribution, KeybindingContribution } from '@theia/core/lib/common';
import { TerminalFrontendContribution } from './terminal-frontend-contribution';
import { TerminalWidget, TerminalWidgetOptions, TERMINAL_WIDGET_FACTORY_ID } from './terminal-widget';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { ITerminalServer, terminalPath } from '../common/terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { IShellTerminalServer, shellTerminalPath } from '../common/shell-terminal-protocol';
import { FrontendApplication } from '@theia/core/lib/browser';

import '../../src/browser/terminal.css';
import 'xterm/lib/xterm.css';

export default new ContainerModule(bind => {
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
                endpoint: { path: '/services/terminals' },
                id: 'terminal-' + counter,
                caption: 'Terminal ' + counter,
                label: 'Terminal ' + counter,
                destroyTermOnClose: true,
                ...options
            });
            const result = child.get(TerminalWidget);
            const app = ctx.container.get(FrontendApplication);

            app.shell.addToMainArea(result);
            app.shell.activateMain(result.id);
            return result;
        }
    }));

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

    bind(IShellTerminalServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const terminalWatcher = ctx.container.get(TerminalWatcher);
        return connection.createProxy<ITerminalServer>(shellTerminalPath, terminalWatcher.getTerminalClient());
    }).inSingletonScope();
});
