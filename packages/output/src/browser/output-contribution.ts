/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MenuContribution, CommandContribution, MenuModelRegistry, CommandRegistry, Command } from "@theia/core";
import { WidgetManager, FrontendApplication, CommonMenus } from "@theia/core/lib/browser";
import { inject, injectable } from "inversify";
import { OUTPUT_WIDGET_KIND, OutputWidget } from "./output-widget";

export namespace OutputCommands {
    export const TOGGLE: Command = {
        id: 'output:open',
        label: 'Toggle Output'
    };
}

@injectable()
export class OutputContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(FrontendApplication) protected readonly app: FrontendApplication) {
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(OutputCommands.TOGGLE, {
            execute: () => this.toggleOutputWidget()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.VIEW, {
            commandId: OutputCommands.TOGGLE.id
        });
    }

    async toggleOutputWidget(): Promise<OutputWidget |  undefined> {
        const outputWidgets = this.widgetManager.getWidgets(OUTPUT_WIDGET_KIND);
        if (outputWidgets.length > 0) {
            const outputWidget = outputWidgets[0];
            if (outputWidget.isVisible) {
                outputWidget.close();
            }
            return undefined;
        } else {
            const outputWidget = await this.widgetManager.getOrCreateWidget<OutputWidget>(OUTPUT_WIDGET_KIND);
            if (!outputWidget.isAttached) {
                this.app.shell.addToMainArea(outputWidget);
            }
            this.app.shell.activateMain(outputWidget.id);
            outputWidget.update();
            return outputWidget;
        }
    }
}
