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

import { injectable, inject } from 'inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { Widget, KeybindingRegistry, KeybindingContext, ApplicationShell } from '@theia/core/lib/browser';
import { OUTPUT_WIDGET_KIND, OutputWidget } from './output-widget';
import { Command, CommandRegistry } from '@theia/core/lib/common';

export namespace OutputCommands {

    const OUTPUT_CATEGORY = 'Output';

    export const CLEAR_OUTPUT_TOOLBAR: Command = {
        id: 'output:clear',
        category: OUTPUT_CATEGORY,
        label: 'Clear Output',
        iconClass: 'clear-all'
    };

    export const SELECT_ALL: Command = {
        id: 'output:selectAll',
        category: OUTPUT_CATEGORY,
        label: 'Select All'
    };

}

/**
 * Enabled when the `Output` widget is the `activeWidget` in the shell.
 */
@injectable()
export class OutputWidgetIsActiveContext implements KeybindingContext {

    static readonly ID = 'output:isActive';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    readonly id = OutputWidgetIsActiveContext.ID;

    isEnabled(): boolean {
        return this.shell.activeWidget instanceof OutputWidget;
    }

}

@injectable()
export class OutputContribution extends AbstractViewContribution<OutputWidget> {

    @inject(OutputWidgetIsActiveContext)
    protected readonly outputIsActiveContext: OutputWidgetIsActiveContext;

    constructor() {
        super({
            widgetId: OUTPUT_WIDGET_KIND,
            widgetName: 'Output',
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: 'output:toggle',
            toggleKeybinding: 'ctrlcmd+shift+u'
        });
    }

    registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(OutputCommands.CLEAR_OUTPUT_TOOLBAR, {
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
            execute: widget => this.withWidget(widget, outputWidget => this.clear(outputWidget))
        });
        commands.registerCommand(OutputCommands.SELECT_ALL, {
            isEnabled: () => this.outputIsActiveContext.isEnabled(),
            isVisible: () => this.outputIsActiveContext.isEnabled(),
            execute: widget => this.withWidget(widget, outputWidget => outputWidget.selectAll())
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        super.registerKeybindings(registry);
        registry.registerKeybindings({
            command: OutputCommands.SELECT_ALL.id,
            keybinding: 'CtrlCmd+A',
            context: OutputWidgetIsActiveContext.ID
        });
    }

    protected async clear(widget: OutputWidget): Promise<void> {
        widget.clear();
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), cb: (problems: OutputWidget) => T): T | false {
        if (widget instanceof OutputWidget && widget.id === OUTPUT_WIDGET_KIND) {
            return cb(widget);
        }
        return false;
    }

}
