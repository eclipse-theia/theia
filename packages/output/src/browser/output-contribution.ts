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
import URI from '@theia/core/lib/common/uri';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { MaybePromise } from '@theia/core/lib/common/types';
import { CommonCommands, quickCommand, OpenHandler, OpenerOptions } from '@theia/core/lib/browser';
import { Command, CommandRegistry, MenuModelRegistry } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { OutputWidget } from './output-widget';
import { OutputContextMenu } from './output-context-menu';
import { OutputUri } from '../common/output-uri';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';

export namespace OutputCommands {

    const OUTPUT_CATEGORY = 'Output';

    /* #region VS Code `OutputChannel` API */
    // Based on: https://github.com/theia-ide/vscode/blob/standalone/0.19.x/src/vs/vscode.d.ts#L4692-L4745

    export const APPEND: Command = {
        id: 'output:append'
    };

    export const APPEND_LINE: Command = {
        id: 'output:appendLine'
    };

    export const CLEAR: Command = {
        id: 'output:clear'
    };

    export const SHOW: Command = {
        id: 'output:show'
    };

    export const HIDE: Command = {
        id: 'output:hide'
    };

    export const DISPOSE: Command = {
        id: 'output:dispose'
    };

    /* #endregion VS Code `OutputChannel` API */

    export const CLEAR__WIDGET: Command = {
        id: 'output:widget:clear',
        category: OUTPUT_CATEGORY,
        iconClass: 'clear-all'
    };

    export const LOCK__WIDGET: Command = {
        id: 'output:widget:lock',
        category: OUTPUT_CATEGORY,
        iconClass: 'fa fa-unlock'
    };

    export const UNLOCK__WIDGET: Command = {
        id: 'output:widget:unlock',
        category: OUTPUT_CATEGORY,
        iconClass: 'fa fa-lock'
    };

    export const CLEAR__QUICK_PICK: Command = {
        id: 'output:pick-clear',
        label: 'Clear Output Channel...',
        category: OUTPUT_CATEGORY
    };

    export const SHOW__QUICK_PICK: Command = {
        id: 'output:pick-show',
        label: 'Show Output Channel...',
        category: OUTPUT_CATEGORY
    };

    export const HIDE__QUICK_PICK: Command = {
        id: 'output:pick-hide',
        label: 'Hide Output Channel...',
        category: OUTPUT_CATEGORY
    };

    export const DISPOSE__QUICK_PICK: Command = {
        id: 'output:pick-dispose',
        label: 'Close Output Channel...',
        category: OUTPUT_CATEGORY
    };

    export const COPY_ALL: Command = {
        id: 'output:copy-all',
    };
}

@injectable()
export class OutputContribution extends AbstractViewContribution<OutputWidget> implements OpenHandler {

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    readonly id: string = `${OutputWidget.ID}-opener`;

    constructor() {
        super({
            widgetId: OutputWidget.ID,
            widgetName: 'Output',
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: 'output:toggle',
            toggleKeybinding: 'CtrlCmd+Shift+U'
        });
    }

    registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(OutputCommands.CLEAR__WIDGET, {
            isEnabled: arg => {
                if (arg instanceof Widget) {
                    return arg instanceof OutputWidget;
                }
                return this.shell.currentWidget instanceof OutputWidget;
            },
            isVisible: arg => {
                if (arg instanceof Widget) {
                    return arg instanceof OutputWidget;
                }
                return this.shell.currentWidget instanceof OutputWidget;
            },
            execute: () => {
                this.widget.then(widget => {
                    this.withWidget(widget, output => {
                        output.clear();
                        return true;
                    });
                });
            }
        });
        registry.registerCommand(OutputCommands.LOCK__WIDGET, {
            isEnabled: widget => this.withWidget(widget, output => !output.isLocked),
            isVisible: widget => this.withWidget(widget, output => !output.isLocked),
            execute: widget => this.withWidget(widget, output => {
                output.lock();
                return true;
            })
        });
        registry.registerCommand(OutputCommands.UNLOCK__WIDGET, {
            isEnabled: widget => this.withWidget(widget, output => output.isLocked),
            isVisible: widget => this.withWidget(widget, output => output.isLocked),
            execute: widget => this.withWidget(widget, output => {
                output.unlock();
                return true;
            })
        });
        registry.registerCommand(OutputCommands.COPY_ALL, {
            execute: () => {
                const textToCopy = this.tryGetWidget()?.getText();
                if (textToCopy) {
                    this.clipboardService.writeText(textToCopy);
                }
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        super.registerMenus(registry);
        registry.registerMenuAction(OutputContextMenu.TEXT_EDIT_GROUP, {
            commandId: CommonCommands.COPY.id
        });
        registry.registerMenuAction(OutputContextMenu.TEXT_EDIT_GROUP, {
            commandId: OutputCommands.COPY_ALL.id,
            label: 'Copy All'
        });
        registry.registerMenuAction(OutputContextMenu.COMMAND_GROUP, {
            commandId: quickCommand.id,
            label: 'Find Command...'
        });
        registry.registerMenuAction(OutputContextMenu.WIDGET_GROUP, {
            commandId: OutputCommands.CLEAR__WIDGET.id,
            label: 'Clear Output'
        });
    }

    canHandle(uri: URI): MaybePromise<number> {
        return OutputUri.is(uri) ? 200 : 0;
    }

    async open(uri: URI, options?: OpenerOptions): Promise<OutputWidget> {
        if (!OutputUri.is(uri)) {
            throw new Error(`Expected '${OutputUri.SCHEME}' URI scheme. Got: ${uri} instead.`);
        }
        const widget = await this.openView(options);
        widget.setInput(OutputUri.channelName(uri));
        return widget;
    }

    protected withWidget(
        widget: Widget | undefined = this.tryGetWidget(),
        predicate: (output: OutputWidget) => boolean = () => true
    ): boolean | false {
        return widget instanceof OutputWidget ? predicate(widget) : false;
    }
}
