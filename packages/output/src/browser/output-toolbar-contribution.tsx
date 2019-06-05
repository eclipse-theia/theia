/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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
import { OutputWidget } from './output-widget';
import { OutputChannelManager } from '../common/output-channel';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { OutputCommands } from './output-contribution';
import * as React from 'react';

@injectable()
export class OutputToolbarContribution implements TabBarToolbarContribution {

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        toolbarRegistry.registerItem({
            id: 'channels',
            render: () => this.renderChannelSelector(),
            isVisible: widget => (widget instanceof OutputWidget),
            onDidChange: this.outputChannelManager.onListOrSelectionChange
        });

        toolbarRegistry.registerItem({
            id: OutputCommands.CLEAR_OUTPUT_TOOLBAR.id,
            command: OutputCommands.CLEAR_OUTPUT_TOOLBAR.id,
            tooltip: 'Clear Output',
            priority: 1,
        });
    }

    protected readonly NONE = '<no channels>';

    protected renderChannelSelector(): React.ReactNode {
        const channelOptionElements: React.ReactNode[] = [];
        this.outputChannelManager.getVisibleChannels().forEach(channel => {
            channelOptionElements.push(<option value={channel.name} key={channel.name}>{channel.name}</option>);
        });
        if (channelOptionElements.length === 0) {
            channelOptionElements.push(<option key={this.NONE} value={this.NONE}>{this.NONE}</option>);
        }
        return <select
            id={OutputWidget.IDs.CHANNEL_LIST}
            key={OutputWidget.IDs.CHANNEL_LIST}
            value={this.outputChannelManager.selectedChannel ? this.outputChannelManager.selectedChannel.name : this.NONE}
            onChange={this.changeChannel}
        >
            {channelOptionElements}
        </select>;
    }

    protected changeChannel = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const channelName = event.target.value;
        if (channelName !== this.NONE) {
            this.outputChannelManager.selectedChannel = this.outputChannelManager.getChannel(channelName);
        }
    }
}
