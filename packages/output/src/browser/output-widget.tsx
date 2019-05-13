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

import { inject, injectable, postConstruct } from 'inversify';
import { Message, Widget, MessageLoop } from '@theia/core/lib/browser';
import { OutputChannelManager, OutputChannel } from '../common/output-channel';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

import '../../src/browser/style/output.css';
import * as Xterm from 'xterm';
// import { TerminalPreferences } from '@theia/terminal/lib/browser/terminal-preferences';
import { getCSSPropertiesFromPage } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { proposeGeometry } from 'xterm/lib/addons/fit/fit';
import { PreferenceServiceImpl } from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';

export const OUTPUT_WIDGET_KIND = 'outputView';

@injectable()
export class OutputWidget extends ReactWidget {

    protected selectedChannel: OutputChannel | undefined;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    @inject(PreferenceServiceImpl)
    protected prefService: PreferenceServiceImpl;
    @inject(ThemeService)
    protected themeService: ThemeService;

    private term: Xterm.Terminal;

    constructor() {
        super();
        this.id = OUTPUT_WIDGET_KIND;
        this.title.label = 'Output';
        this.title.caption = 'Output';
        this.title.iconClass = 'fa output-tab-icon';
        this.title.closable = true;
        this.addClass('theia-output');
    }

    @postConstruct()
    protected async init(): Promise<void> {
        this.outputChannelManager.getChannels().forEach(this.registerListener.bind(this));
        this.toDispose.push(this.outputChannelManager.onChannelAdded(channel => {
            this.registerListener(channel);
            this.update();
        }));
        this.toDispose.push(this.outputChannelManager.onChannelDelete(event => {
            if (this.selectedChannel && this.selectedChannel.name === event.channelName) {
                this.selectedChannel = this.getVisibleChannels()[0];
            }
            this.update();
        }));

        /* Read CSS properties from the page and apply them to the terminal.  */
        const cssProps = getCSSPropertiesFromPage();
        await this.prefService.ready;

        this.term = new Xterm.Terminal({
            experimentalCharAtlas: 'dynamic',
            cursorBlink: false,
            fontFamily: this.prefService.get('terminal.integrated.fontFamily'),
            fontSize: this.prefService.get('terminal.integrated.fontSize'),
            fontWeight: this.prefService.get('terminal.integrated.fontWeight'),
            fontWeightBold: this.prefService.get('terminal.integrated.fontWeightBold'),
            letterSpacing: this.prefService.get('terminal.integrated.letterSpacing'),
            lineHeight: this.prefService.get('terminal.integrated.lineHeight'),
            theme: {
                foreground: cssProps.foreground,
                background: cssProps.background,
                cursor: cssProps.foreground,
                selection: cssProps.selection
            },
        });

        this.toDispose.push(this.prefService.onPreferenceChanged(change => {
            const lastSeparator = change.preferenceName.lastIndexOf('.');
            if (lastSeparator > 0) {
                const preferenceName = change.preferenceName.substr(lastSeparator + 1);
                this.term.setOption(preferenceName, this.prefService.get(change.preferenceName));
                this.update();
            }
        }));

        this.toDispose.push(this.themeService.onThemeChange(c => {
            const changedProps = getCSSPropertiesFromPage();
            this.term.setOption('theme', {
                foreground: changedProps.foreground,
                background: changedProps.background,
                cursor: changedProps.foreground,
                selection: cssProps.selection
            });
        }));

        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const channelSelector = document.getElementById(OutputWidget.IDs.CHANNEL_LIST);
        if (channelSelector) {
            channelSelector.focus();
        } else {
            this.node.focus();
        }
    }

    protected registerListener(outputChannel: OutputChannel): void {
        if (!this.selectedChannel) {
            this.selectedChannel = outputChannel;
        }
        this.toDispose.push(outputChannel.onContentChange(c => {
            if (outputChannel === this.selectedChannel) {
                this.update();
            }
        }));
        this.toDispose.push(outputChannel.onVisibilityChange(event => {
            if (event.visible) {
                this.selectedChannel = outputChannel;
            } else if (outputChannel === this.selectedChannel) {
                this.selectedChannel = this.getVisibleChannels()[0];
            }
            this.update();
        }));
    }

    protected render(): React.ReactNode {
        console.log('>>>>render');
        return <React.Fragment>
            <div id={OutputWidget.IDs.OVERLAY}>
                {this.renderChannelSelector()}
                {this.renderClearButton()}
            </div>
            {this.renderChannelContents()}
        </React.Fragment>;
    }

    protected renderClearButton(): React.ReactNode {
        return <span title='Clear'
            className={this.selectedChannel ? 'enabled' : ''}
            id={OutputWidget.IDs.CLEAR_BUTTON} onClick={() => this.clear()} />;
    }

    protected clear(): void {
        if (this.selectedChannel) {
            this.selectedChannel.clear();
        }
    }

    protected renderChannelContents(): React.ReactNode {
        return <div id={OutputWidget.IDs.CONTENTS} className='terminal-container'></div>;
    }

    private readonly NONE = '<no channels>';

    protected renderChannelSelector(): React.ReactNode {
        const channelOptionElements: React.ReactNode[] = [];
        this.getVisibleChannels().forEach(channel => {
            channelOptionElements.push(<option value={channel.name} key={channel.name}>{channel.name}</option>);
        });
        if (channelOptionElements.length === 0) {
            channelOptionElements.push(<option key={this.NONE} value={this.NONE}>{this.NONE}</option>);
        }
        return <select
            id={OutputWidget.IDs.CHANNEL_LIST}
            value={this.selectedChannel ? this.selectedChannel.name : this.NONE}
            onChange={
                async event => {
                    const channelName = (event.target as HTMLSelectElement).value;
                    if (channelName !== this.NONE) {
                        this.selectedChannel = this.outputChannelManager.getChannel(channelName);
                        this.update();
                    }
                }
            }>
            {channelOptionElements}
        </select>;
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (!this.isVisible || !this.isAttached || !this.term) {
            return;
        }

        this.open();
        this.resizeTerminal();

        if (this.selectedChannel) {
            const selectedLines = this.selectedChannel.getLines();

            if (selectedLines.length === 0) {
                this.term.reset();
            }

            for (const text of selectedLines) {
                const lines = text.split(/[\n\r]+/);
                for (const line of lines) {
                    this.term.writeln(line);
                }
            }

            if (selectedLines.length === 0) {
                this.showNoOutput();
            }
        } else {
            this.showNoOutput();
        }
    }

    protected open(): void {
        if (this.term.element) {
            return;
        }
         const contentElement = this.node.children.namedItem(OutputWidget.IDs.CONTENTS);
         if (contentElement) {
             this.term.open(contentElement as HTMLElement); // use element instead of bool flag;
         }
    }

    processMessage(msg: Message): void {
        super.processMessage(msg);
        switch (msg.type) {
            case 'fit-request':
                this.onFitRequest(msg);
                break;
            default:
                break;
        }
    }
    protected onFitRequest(msg: Message): void {
        MessageLoop.sendMessage(this, Widget.ResizeMessage.UnknownSize);
    }

    protected onAfterShow(msg: Message): void {
        this.update();
    }
    protected onAfterAttach(msg: Message): void {
        this.update();
    }
    protected onResize(msg: Widget.ResizeMessage): void {
        this.update();
    }

    protected resizeTerminal(): void {
        const geo = proposeGeometry(this.term);
        const cols = geo.cols;
        const rows = geo.rows;
        console.log('Proposed size ', cols, rows);
        this.term.resize(cols, rows);
    }

    private showNoOutput() {
        this.term.reset();
        this.term.write('<no output yet>');
    }

    protected getVisibleChannels(): OutputChannel[] {
        return this.outputChannelManager.getChannels().filter(channel => channel.isVisible);
    }
}

export namespace OutputWidget {
    export namespace IDs {
        export const CLEAR_BUTTON = 'outputClear';
        export const CONTENTS = 'outputContents';
        export const OVERLAY = 'outputOverlay';
        export const CHANNEL_LIST = 'outputChannelList';
    }
}
