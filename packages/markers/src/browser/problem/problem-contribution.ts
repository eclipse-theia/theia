/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from 'inversify';
import {
    MenuModelRegistry, Command, CommandContribution,
    MenuContribution, KeybindingContribution, KeybindingRegistry,
    TheiaKeyCodeUtils, Key, Modifier, CommandRegistry
} from '@theia/core/lib/common';
import { FrontendApplication, CommonMenus } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { PROBLEM_KIND } from '../../common/problem-marker';

export namespace ProblemCommands {
    export const OPEN: Command = {
        id: 'problems:open',
        label: 'Open Problems View'
    };
}

@injectable()
export class ProblemContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    constructor(
        @inject(WidgetManager) protected readonly widgetFactory: WidgetManager,
        @inject(FrontendApplication) protected readonly app: FrontendApplication) {
    }

    registerDefaultKeyBindings(keybindings: KeybindingRegistry): void {
        keybindings.registerDefaultKeyBinding({
            commandId: ProblemCommands.OPEN.id,
            keyCode: TheiaKeyCodeUtils.createKeyCode({
                first: Key.KEY_M, modifiers: [Modifier.M2, Modifier.M1]
            })
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ProblemCommands.OPEN, {
            execute: () => this.openProblemsView()
        });
    }

    protected async openProblemsView(): Promise<void> {
        const markerWidget = await this.widgetFactory.getOrCreateWidget(PROBLEM_KIND);
        if (!markerWidget.isAttached) {
            this.app.shell.addToMainArea(markerWidget);
        }
        this.app.shell.activateMain(markerWidget.id);
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.VIEW, {
            commandId: ProblemCommands.OPEN.id
        });
    }
}
