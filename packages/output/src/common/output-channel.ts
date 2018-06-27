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

import { Emitter, Event } from "@theia/core";
import { injectable, inject } from "inversify";
import { OutputPreferences } from "./output-preferences";

@injectable()
export class OutputChannelManager {
    protected readonly channels = new Map<string, OutputChannel>();

    private readonly channelDeleteEmitter = new Emitter<{channelName: string}>();
    private readonly channelAddedEmitter = new Emitter<OutputChannel>();
    readonly onChannelDelete = this.channelDeleteEmitter.event;
    readonly onChannelAdded = this.channelAddedEmitter.event;

    constructor(@inject(OutputPreferences) protected preferences: OutputPreferences) {
    }

    getChannel(name: string): OutputChannel {
        const existing = this.channels.get(name);
        if (existing) {
            return existing;
        }
        const channel = new OutputChannel(name, this.preferences);
        this.channels.set(name, channel);
        this.channelAddedEmitter.fire(channel);
        return channel;
    }

    deleteChannel(name: string): void {
        this.channels.delete(name);
        this.channelDeleteEmitter.fire({channelName: name});
    }

    getChannels(): OutputChannel[] {
        return Array.from(this.channels.values());
    }
}

export class OutputChannel {

    private readonly visibilityChangeEmitter = new Emitter<{visible: boolean}>();
    private readonly contentChangeEmitter = new Emitter<OutputChannel>();
    private lines: string[] = [];
    private currentLine: string | undefined;
    private visible: boolean = true;

    readonly onVisibilityChange: Event<{visible: boolean}> = this.visibilityChangeEmitter.event;
    readonly onContentChange: Event<OutputChannel> = this.contentChangeEmitter.event;

    constructor(readonly name: string, readonly preferences: OutputPreferences) { }

    append(value: string): void {
        if (this.currentLine === undefined) {
            this.currentLine = value;
        } else {
            this.currentLine += value;
        }
        this.contentChangeEmitter.fire(this);
    }

    appendLine(line: string): void {
        if (this.currentLine !== undefined) {
            this.lines.push(this.currentLine + line);
            this.currentLine = undefined;
        } else {
            this.lines.push(line);
        }
        const maxChannelHistory = this.preferences['output.maxChannelHistory'];
        if (this.lines.length > maxChannelHistory) {
            this.lines.splice(0, this.lines.length - maxChannelHistory);
        }
        this.contentChangeEmitter.fire(this);
    }

    clear(): void {
        this.lines.length = 0;
        this.currentLine = undefined;
        this.contentChangeEmitter.fire(this);
    }

    setVisibility(visible: boolean): void {
        this.visible = visible;
        this.visibilityChangeEmitter.fire({visible});
    }

    getLines(): string[] {
        if (this.currentLine !== undefined) {
            return [...this.lines, this.currentLine];
        } else {
            return this.lines;
        }
    }

    get isVisible(): boolean {
        return this.visible;
    }
}
