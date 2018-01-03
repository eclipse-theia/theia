/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { VirtualWidget, VirtualRenderer, Message } from "@theia/core/lib/browser";
import { VirtualElement, h } from "@phosphor/virtualdom";
import { OutputChannelManager, OutputChannelImpl } from "../common/output-channel";

import "../../src/browser/style/output.css";

export const OUTPUT_WIDGET_KIND = 'outputView';

@injectable()
export class OutputWidget extends VirtualWidget {

    private selectedChannel: OutputChannelImpl;

    constructor( @inject(OutputChannelManager) protected readonly outputChannelManager: OutputChannelManager) {
        super();
        this.id = OUTPUT_WIDGET_KIND;
        this.title.label = 'Output';
        this.title.iconClass = 'fa fa-flag';
        this.title.closable = true;
        this.addClass('theia-output');
        outputChannelManager.getChannels().forEach(this.registerListener.bind(this));
        outputChannelManager.onChannelAdded(channel => {
            this.registerListener(channel);
            this.update();
        });
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

    protected registerListener(outputChannel: OutputChannelImpl) {
        if (!this.selectedChannel) {
            this.selectedChannel = outputChannel;
        }
        outputChannel.onContentChange(c => {
            if (outputChannel === this.selectedChannel) {
                this.update();
            }
        });
    }

    render(): VirtualElement[] {
        return [this.renderChannelSelector(), this.renderChannelContents()];
    }

    private readonly OUTPUT_CONTENTS_ID = 'outputContents';

    protected renderChannelContents(): VirtualElement {
        if (this.selectedChannel) {
            return h.div(
                { id: this.OUTPUT_CONTENTS_ID },
                VirtualRenderer.flatten(this.selectedChannel.getLines().map(line => this.toHtmlText(line))));
        } else {
            return h.div({ id: this.OUTPUT_CONTENTS_ID });
        }
    }

    protected toHtmlText(text: string): VirtualElement[] {
        const result: VirtualElement[] = [];
        if (text) {
            const lines = text.split(/([\n\r]+)/);
            for (const line of lines) {
                result.push(h.div(line));
            }
        } else {
            result.push(h.div('<no output yet>'));
        }
        return result;
    }

    private readonly NONE = '<no channels>';

    protected renderChannelSelector(): VirtualElement {
        const channelOptionElements: h.Child[] = [];
        this.outputChannelManager.getChannels().forEach(channel => {
            channelOptionElements.push(h.option({ value: channel.name }, channel.name));
        });
        if (channelOptionElements.length === 0) {
            channelOptionElements.push(h.option({ value: this.NONE }, this.NONE));
        }
        return h.select({
            id: 'outputChannelList',
            onchange: async event => {
                const channelName = (event.target as HTMLSelectElement).value;
                if (channelName !== this.NONE) {
                    this.selectedChannel = this.outputChannelManager.getChannel(channelName);
                    this.update();
                }
            }
        }, VirtualRenderer.flatten(channelOptionElements));
    }

    protected onUpdateRequest(msg: Message) {
        super.onUpdateRequest(msg);
        setTimeout(() => {
            const div = document.getElementById(this.OUTPUT_CONTENTS_ID) as HTMLDivElement;
            if (div && div.children.length > 0) {
                div.children[div.children.length - 1].scrollIntoView(false);
            }
        });
    }
}
