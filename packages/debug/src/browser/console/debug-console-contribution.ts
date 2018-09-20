/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { interfaces, injectable } from 'inversify';
import { AbstractViewContribution, bindViewContribution, WidgetFactory } from '@theia/core/lib/browser';
import { ConsoleContainer } from '@theia/console/lib/browser/console-container';
import { ConsoleWidget, ConsoleOptions } from '@theia/console/lib/browser/console-widget';
import { DebugConsoleSession } from './debug-console-session';

@injectable()
export class DebugConsoleContribution extends AbstractViewContribution<ConsoleWidget> {

    constructor() {
        super({
            widgetId: DebugConsoleContribution.options.id,
            widgetName: DebugConsoleContribution.options.title!.label!,
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: 'debug:console:toggle',
            toggleKeybinding: 'ctrlcmd+shift+y'
        });
    }

    static options: ConsoleOptions = {
        id: 'debug-console',
        title: {
            label: 'Debug Console'
        },
        input: {
            uri: DebugConsoleSession.uri,
            options: {
                autoSizing: true,
                minHeight: 1,
                maxHeight: 10
            }
        }
    };

    static create(parent: interfaces.Container): ConsoleWidget {
        const child = ConsoleContainer.create(parent, DebugConsoleContribution.options);
        const widget = child.get(ConsoleWidget);
        widget.session = child.get(DebugConsoleSession);
        return widget;
    }

    static bindContribution(bind: interfaces.Bind): void {
        bind(DebugConsoleSession).toSelf().inSingletonScope();
        bindViewContribution(bind, DebugConsoleContribution).onActivation((context, _) => {
            // eagerly initialize the debug console session
            context.container.get(DebugConsoleSession);
            return _;
        });
        bind(WidgetFactory).toDynamicValue(({ container }) => ({
            id: DebugConsoleContribution.options.id,
            createWidget: () => DebugConsoleContribution.create(container)
        }));
    }

}
