/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

import { inject, injectable } from 'inversify';
import { TerminalWidgetFactoryOptions, TERMINAL_WIDGET_FACTORY_ID } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { TaskInfo, RevealKind } from '../common';

@injectable()
export class TaskTerminalManager {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    async openEmptyTerminal(taskLabel: string): Promise<TerminalWidget> {
        const id = TERMINAL_WIDGET_FACTORY_ID + '-connecting';

        const widget = <TerminalWidget>await this.widgetManager.getOrCreateWidget(
            TERMINAL_WIDGET_FACTORY_ID,
            <TerminalWidgetFactoryOptions>{
                created: new Date().toString(),
                id: id,
                title: taskLabel,
                destroyTermOnClose: true,
                loadingMessage: `Task '${taskLabel}' - Connecting...`
            }
        );

        this.shell.addWidget(widget, { area: 'bottom' });
        this.shell.revealWidget(widget.id);
        return widget;
    }

    async attach(processId: number, taskId: number, taskInfo: TaskInfo | undefined,
                    terminalWidgetId: string, widget?: TerminalWidget): Promise<void> {
        if (!widget) {
            widget = <TerminalWidget>await this.widgetManager.getOrCreateWidget(
                TERMINAL_WIDGET_FACTORY_ID,
                <TerminalWidgetFactoryOptions>{
                    created: new Date().toString(),
                    id: terminalWidgetId,
                    title: taskInfo
                        ? `Task: ${taskInfo.config.label}`
                        : `Task: #${taskId}`,
                    destroyTermOnClose: true
                }
            );

            this.shell.addWidget(widget, { area: 'bottom' });
        }

        if (taskInfo && taskInfo.config.presentation && taskInfo.config.presentation.reveal === RevealKind.Always) {
            if (taskInfo.config.presentation.focus) { // assign focus to the terminal if presentation.focus is true
                this.shell.activateWidget(widget.id);
            } else { // show the terminal but not assign focus
                this.shell.revealWidget(widget.id);
            }
        }

        widget.start(processId);
    }

}
