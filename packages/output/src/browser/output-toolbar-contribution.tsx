// *****************************************************************************
// Copyright (C) 2019 Arm and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { OutputWidget } from './output-widget';
import { OutputCommands } from './output-commands';
import { OutputContribution } from './output-contribution';
import { OutputChannelManager } from './output-channel';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class OutputToolbarContribution implements TabBarToolbarContribution {

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    @inject(OutputContribution)
    protected readonly outputContribution: OutputContribution;

    protected readonly onOutputWidgetStateChangedEmitter = new Emitter<void>();
    protected readonly onOutputWidgetStateChanged = this.onOutputWidgetStateChangedEmitter.event;

    protected readonly onChannelsChangedEmitter = new Emitter<void>();
    protected readonly onChannelsChanged = this.onChannelsChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.outputContribution.widget.then(widget => {
            widget.onStateChanged(() => this.onOutputWidgetStateChangedEmitter.fire());
        });
        const fireChannelsChanged = () => this.onChannelsChangedEmitter.fire();
        this.outputChannelManager.onSelectedChannelChanged(fireChannelsChanged);
        this.outputChannelManager.onChannelAdded(fireChannelsChanged);
        this.outputChannelManager.onChannelDeleted(fireChannelsChanged);
        this.outputChannelManager.onChannelWasShown(fireChannelsChanged);
        this.outputChannelManager.onChannelWasHidden(fireChannelsChanged);
    }

    registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): void {
        toolbarRegistry.registerItem({
            id: 'channels',
            render: () => this.renderChannelSelector(),
            isVisible: widget => widget instanceof OutputWidget,
            onDidChange: this.onChannelsChanged
        });
        toolbarRegistry.registerItem({
            id: OutputCommands.CLEAR__WIDGET.id,
            command: OutputCommands.CLEAR__WIDGET.id,
            tooltip: nls.localizeByDefault('Clear Output'),
            priority: 1,
        });
        toolbarRegistry.registerItem({
            id: OutputCommands.LOCK__WIDGET.id,
            command: OutputCommands.LOCK__WIDGET.id,
            tooltip: nls.localizeByDefault('Turn Auto Scrolling Off'),
            onDidChange: this.onOutputWidgetStateChanged,
            priority: 2
        });
        toolbarRegistry.registerItem({
            id: OutputCommands.UNLOCK__WIDGET.id,
            command: OutputCommands.UNLOCK__WIDGET.id,
            tooltip: nls.localizeByDefault('Turn Auto Scrolling On'),
            onDidChange: this.onOutputWidgetStateChanged,
            priority: 2
        });
    }

    protected readonly NONE = '<no channels>';
    protected readonly OUTPUT_CHANNEL_LIST_ID = 'outputChannelList';

    protected renderChannelSelector(): React.ReactNode {
        const channelOptionElements: SelectOption[] = [];
        this.outputChannelManager.getVisibleChannels().forEach((channel, i) => {
            channelOptionElements.push({
                value: channel.name
            });
        });
        if (channelOptionElements.length === 0) {
            channelOptionElements.push({
                value: this.NONE
            });
        }
        return <div id={this.OUTPUT_CHANNEL_LIST_ID} key={this.OUTPUT_CHANNEL_LIST_ID}>
            <SelectComponent
                key={this.outputChannelManager.selectedChannel?.name}
                options={channelOptionElements}
                defaultValue={this.outputChannelManager.selectedChannel?.name}
                onChange={option => this.changeChannel(option)}
            />
        </div>;
    }

    protected changeChannel = (option: SelectOption) => {
        const channelName = option.value;
        if (channelName !== this.NONE && channelName) {
            this.outputChannelManager.getChannel(channelName).show();
        }
    };
}
