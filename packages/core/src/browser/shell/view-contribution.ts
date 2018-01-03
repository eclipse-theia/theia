/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import {
    MenuModelRegistry, Command, CommandContribution,
    MenuContribution, KeybindingContribution, KeybindingRegistry,
    KeyCode, CommandRegistry
} from '../../common';
import { WidgetManager } from '../widget-manager';
import { Widget } from '@phosphor/widgets';
import { FrontendApplicationContribution, FrontendApplication } from '../frontend-application';
import { CommonMenus } from '../common-frontend-contribution';
import { ApplicationShell } from './application-shell';

export interface OpenViewArguments extends ApplicationShell.WidgetOptions {
    toggle?: boolean
    activate?: boolean;
}

export interface ViewContributionOptions {
    widgetId: string;
    widgetName: string;
    defaultWidgetOptions: ApplicationShell.WidgetOptions;
    toggleCommandId?: string;
    toggleKeybinding?: KeyCode;
}

/**
 * An abstract superclass for frontend contributions that add a view to the application shell.
 */
@injectable()
export abstract class AbstractViewContribution<T extends Widget> implements CommandContribution, MenuContribution, KeybindingContribution, FrontendApplicationContribution {

    @inject(WidgetManager) protected widgetManager: WidgetManager;
    @inject(ApplicationShell) protected shell: ApplicationShell;

    readonly toggleCommand?: Command;

    constructor(
        protected readonly options: ViewContributionOptions
    ) {
        if (options.toggleCommandId) {
            this.toggleCommand = {
                id: options.toggleCommandId,
                label: 'Toggle ' + options.widgetName + ' View'
            };
        }
    }

    get widget(): Promise<T> {
        return this.widgetManager.getOrCreateWidget<T>(this.options.widgetId);
    }

    async openView(args: Partial<OpenViewArguments> = {}): Promise<T> {
        const widget = await this.widget;
        const tabBar = this.shell.getTabBarFor(widget);
        if (!tabBar) {
            // The widget is not attached yet, so add it to the shell
            const widgetArgs: OpenViewArguments = {
                ...this.options.defaultWidgetOptions,
                ...args
            };
            this.shell.addWidget(widget, widgetArgs);
        } else if (tabBar.currentTitle === widget.title && args.toggle) {
            // The widget is attached and visible, so close it (toggle)
            widget.close();
        }
        if (widget.isAttached && args.activate) {
            this.shell.activateWidget(widget.id);
        }
        return widget;
    }

    initializeLayout(app: FrontendApplication) {
        this.openView();
    }

    registerCommands(commands: CommandRegistry): void {
        if (this.toggleCommand) {
            commands.registerCommand(this.toggleCommand, {
                execute: () => this.openView({
                    toggle: true,
                    activate: true
                })
            });
        }
    }

    registerMenus(menus: MenuModelRegistry): void {
        if (this.toggleCommand) {
            menus.registerMenuAction(CommonMenus.VIEW, {
                commandId: this.toggleCommand.id,
                label: this.options.widgetName
            });
        }
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        if (this.toggleCommand && this.options.toggleKeybinding) {
            keybindings.registerKeybinding({
                commandId: this.toggleCommand.id,
                keyCode: this.options.toggleKeybinding
            });
        }
    }
}
