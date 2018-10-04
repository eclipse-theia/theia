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
import { Message } from '@theia/core/lib/browser';
import { OutputChannelManager, OutputChannel } from '../common/output-channel';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

import '../../src/browser/style/output.css';

export const OUTPUT_WIDGET_KIND = 'outputView';

@injectable()
export class OutputWidget extends ReactWidget {

    protected selectedChannel: OutputChannel | undefined;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

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
    protected init(): void {
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
        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const channelSelector = document.getElementById('outputChannelList');
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
        return <React.Fragment>{this.renderChannelSelector()}{this.renderChannelContents()}</React.Fragment>;
    }

    private readonly OUTPUT_CONTENTS_ID = 'outputContents';

    protected renderChannelContents(): React.ReactNode {
        return <div id={this.OUTPUT_CONTENTS_ID}>{this.renderLines()}</div>;
    }

    protected renderLines(): React.ReactNode[] {
        let id = 0;
        const result = [];

        const style: React.CSSProperties = {
            whiteSpace: 'pre',
            fontFamily: 'monospace',
        };

        if (this.selectedChannel) {
            for (const text of this.selectedChannel.getLines()) {
                const lines = text.split(/[\n\r]+/);
                for (const line of lines) {
                    result.push(<div style={style} key={id++}>{line}</div>);
                }
            }
        }
        if (result.length === 0) {
            result.push(<div style={style} key={id++}>{'<no output yet>'}</div>);
        }
        return result;
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
            id='outputChannelList'
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
        setTimeout(() => {
            const div = document.getElementById(this.OUTPUT_CONTENTS_ID) as HTMLDivElement;
            if (div && div.children.length > 0) {
                div.children[div.children.length - 1].scrollIntoView(false);
            }
        });
    }

    protected getVisibleChannels(): OutputChannel[] {
        return this.outputChannelManager.getChannels().filter(channel => channel.isVisible);
    }
}
