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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { MaybePromise } from '@theia/core/lib/common/types';
import { CommonCommands, quickCommand, OpenHandler, open, OpenerOptions, OpenerService } from '@theia/core/lib/browser';
import { CommandRegistry, MenuModelRegistry, CommandService } from '@theia/core/lib/common';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { OutputWidget } from './output-widget';
import { OutputContextMenu } from './output-context-menu';
import { OutputUri } from '../common/output-uri';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { OutputChannelManager, OutputChannel } from '../common/output-channel';
import { OutputCommands } from './output-commands';
import { QuickPickService, QuickPickItem } from '@theia/core/lib/common/quick-pick-service';

@injectable()
export class OutputContribution extends AbstractViewContribution<OutputWidget> implements OpenHandler {

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

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

    @postConstruct()
    protected init(): void {
        this.outputChannelManager.onChannelWasShown(({ name, preserveFocus }) =>
            open(this.openerService, OutputUri.create(name), { activate: !preserveFocus, reveal: true }));
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
        registry.registerCommand(OutputCommands.APPEND, {
            execute: ({ name, text }: { name: string, text: string }) => {
                if (name && text) {
                    this.outputChannelManager.getChannel(name).append(text);
                }
            }
        });
        registry.registerCommand(OutputCommands.APPEND_LINE, {
            execute: ({ name, text }: { name: string, text: string }) => {
                if (name && text) {
                    this.outputChannelManager.getChannel(name).appendLine(text);
                }
            }
        });
        registry.registerCommand(OutputCommands.CLEAR, {
            execute: ({ name }: { name: string }) => {
                if (name) {
                    this.outputChannelManager.getChannel(name).clear();
                }
            }
        });
        registry.registerCommand(OutputCommands.DISPOSE, {
            execute: ({ name }: { name: string }) => {
                if (name) {
                    this.outputChannelManager.deleteChannel(name);
                }
            }
        });
        registry.registerCommand(OutputCommands.SHOW, {
            execute: ({ name, options }: { name: string, options?: { preserveFocus?: boolean } }) => {
                if (name) {
                    const preserveFocus = options && options.preserveFocus || false;
                    this.outputChannelManager.getChannel(name).show({ preserveFocus });
                }
            }
        });
        registry.registerCommand(OutputCommands.HIDE, {
            execute: ({ name }: { name: string }) => {
                if (name) {
                    this.outputChannelManager.getChannel(name).hide();
                }
            }
        });

        registry.registerCommand(OutputCommands.CLEAR__QUICK_PICK, {
            execute: async () => {
                const channel = await this.pick({
                    placeholder: 'Clear output channel.',
                    channels: this.outputChannelManager.getChannels().slice()
                });
                if (channel) {
                    channel.clear();
                }
            },
            isEnabled: () => !!this.outputChannelManager.getChannels().length,
            isVisible: () => !!this.outputChannelManager.getChannels().length
        });
        registry.registerCommand(OutputCommands.SHOW__QUICK_PICK, {
            execute: async () => {
                const channel = await this.pick({
                    placeholder: 'Show output channel.',
                    channels: this.outputChannelManager.getChannels().slice()
                });
                if (channel) {
                    const { name } = channel;
                    registry.executeCommand(OutputCommands.SHOW.id, { name, options: { preserveFocus: false } });
                }
            },
            isEnabled: () => !!this.outputChannelManager.getChannels().length,
            isVisible: () => !!this.outputChannelManager.getChannels().length
        });
        registry.registerCommand(OutputCommands.HIDE__QUICK_PICK, {
            execute: async () => {
                const channel = await this.pick({
                    placeholder: 'Hide output channel.',
                    channels: this.outputChannelManager.getVisibleChannels().slice()
                });
                if (channel) {
                    const { name } = channel;
                    registry.executeCommand(OutputCommands.HIDE.id, { name });
                }
            },
            isEnabled: () => !!this.outputChannelManager.getVisibleChannels().length,
            isVisible: () => !!this.outputChannelManager.getVisibleChannels().length
        });
        registry.registerCommand(OutputCommands.DISPOSE__QUICK_PICK, {
            execute: async () => {
                const channel = await this.pick({
                    placeholder: 'Close output channel.',
                    channels: this.outputChannelManager.getChannels().slice()
                });
                if (channel) {
                    const { name } = channel;
                    registry.executeCommand(OutputCommands.DISPOSE.id, { name });
                }
            },
            isEnabled: () => !!this.outputChannelManager.getChannels().length,
            isVisible: () => !!this.outputChannelManager.getChannels().length
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
        return widget;
    }

    protected withWidget(
        widget: Widget | undefined = this.tryGetWidget(),
        predicate: (output: OutputWidget) => boolean = () => true
    ): boolean | false {
        return widget instanceof OutputWidget ? predicate(widget) : false;
    }

    protected async pick({ channels, placeholder }: { channels: OutputChannel[], placeholder: string }): Promise<OutputChannel | undefined> {
        const items: QuickPickItem<OutputChannel>[] = [];
        for (let i = 0; i < channels.length; i++) {
            const channel = channels[i];
            if (i === 0) {
                items.push({ label: channel.isVisible ? 'Output Channels' : 'Hidden Channels', type: 'separator' });
            } else if (!channel.isVisible && channels[i - 1].isVisible) {
                items.push({ label: 'Hidden Channels', type: 'separator' });
            }
            items.push({ label: channel.name, value: channel });
        }
        return this.quickPickService.show(items, { placeholder });
    }

}
