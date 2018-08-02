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

import { injectable, inject, interfaces } from 'inversify';
import { Widget } from '@phosphor/widgets';
import {
    MenuModelRegistry, Command, CommandContribution,
    MenuContribution, CommandRegistry
} from '../../common';
import { KeybindingContribution, KeybindingRegistry } from '../keybinding';
import { WidgetManager } from '../widget-manager';
import { CommonMenus } from '../common-frontend-contribution';
import { ApplicationShell } from './application-shell';

export interface OpenViewArguments extends ApplicationShell.WidgetOptions {
    toggle?: boolean
    activate?: boolean;
    reveal?: boolean;
}

export interface ViewContributionOptions {
    widgetId: string;
    widgetName: string;
    defaultWidgetOptions: ApplicationShell.WidgetOptions;
    toggleCommandId?: string;
    toggleKeybinding?: string;
}

// tslint:disable-next-line:no-any
export function bindViewContribution<T extends AbstractViewContribution<any>>(bind: interfaces.Bind, identifier: interfaces.Newable<T>): interfaces.BindingWhenOnSyntax<T> {
    const syntax = bind<T>(identifier).toSelf().inSingletonScope();
    bind(CommandContribution).toService(identifier);
    bind(KeybindingContribution).toService(identifier);
    bind(MenuContribution).toService(identifier);
    return syntax;
}

/**
 * An abstract superclass for frontend contributions that add a view to the application shell.
 */
@injectable()
export abstract class AbstractViewContribution<T extends Widget> implements CommandContribution, MenuContribution, KeybindingContribution {

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

    tryGetWidget(): T | undefined {
        return this.widgetManager.tryGetWidget(this.options.widgetId);
    }

    async openView(args: Partial<OpenViewArguments> = {}): Promise<T> {
        const shell = this.shell;
        const widget = await this.widget;
        const tabBar = shell.getTabBarFor(widget);
        const area = shell.getAreaFor(widget);
        if (!tabBar) {
            // The widget is not attached yet, so add it to the shell
            const widgetArgs: OpenViewArguments = {
                ...this.options.defaultWidgetOptions,
                ...args
            };
            shell.addWidget(widget, widgetArgs);
        } else if (args.toggle && area && shell.isExpanded(area) && tabBar.currentTitle === widget.title) {
            // The widget is attached and visible, so close it (toggle)
            widget.close();
        }
        if (widget.isAttached && args.activate) {
            shell.activateWidget(widget.id);
        } else if (widget.isAttached && args.reveal) {
            shell.revealWidget(widget.id);
        }
        return widget;
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
            menus.registerMenuAction(CommonMenus.VIEW_VIEWS, {
                commandId: this.toggleCommand.id,
                label: this.options.widgetName
            });
        }
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        if (this.toggleCommand && this.options.toggleKeybinding) {
            keybindings.registerKeybinding({
                command: this.toggleCommand.id,
                keybinding: this.options.toggleKeybinding
            });
        }
    }
}
