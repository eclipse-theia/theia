/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import {interfaces} from 'inversify';
import {OUTPUT_WIDGET_KIND} from '@theia/output/lib/browser/output-widget';
import {OutputChannel, OutputChannelManager} from '@theia/output/lib/common/output-channel';
import {OutputChannelRegistryMain} from '../../api/plugin-api';

export class OutputChannelRegistryMainImpl implements OutputChannelRegistryMain {
    private delegate: OutputChannelManager;

    private channels: Map<string, OutputChannel> = new Map();

    constructor(container: interfaces.Container) {
        this.delegate = container.get(OutputChannelManager);
    }

    $append(channelName: string, value: string): PromiseLike<void> {
        const outputChannel = this.getChannels(channelName);
        if (outputChannel) {
            outputChannel.append(value);
        }

        return Promise.resolve();
    }

    $clear(channelName: string): PromiseLike<void> {
        const outputChannel = this.getChannels(channelName);
        if (outputChannel) {
            outputChannel.clear();
        }

        return Promise.resolve();
    }

    $dispose(channelName: string): PromiseLike<void> {
        this.delegate.deleteChannel(channelName);
        if (this.channels.has(channelName)) {
            this.channels.delete(channelName);
        }

        return Promise.resolve();
    }

    $reveal(channelName: string, preserveFocus: boolean): PromiseLike<void> {
        const outputChannel = this.getChannels(channelName);
        if (outputChannel) {
            outputChannel.setVisibility(true);
            if (!preserveFocus) {
                this.setOutputChannelFocus();
            }
        }

        return Promise.resolve();
    }

    $close(channelName: string): PromiseLike<void> {
        const outputChannel = this.getChannels(channelName);
        if (outputChannel) {
            outputChannel.setVisibility(false);
        }

        return Promise.resolve();
    }

    private getChannels(channelName: string): OutputChannel | undefined {
        let outputChannel: OutputChannel | undefined;
        if (this.channels.has(channelName)) {
            outputChannel = this.channels.get(channelName);
        } else {
            outputChannel = this.delegate.getChannel(channelName);
            this.channels.set(channelName, outputChannel);
        }

        return outputChannel;
    }

    private setOutputChannelFocus(): void {
        const outputWidget = document.getElementById(OUTPUT_WIDGET_KIND);
        if (outputWidget) {
            outputWidget.focus();
        }
    }
}
