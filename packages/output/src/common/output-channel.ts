/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Emitter, Event } from "@theia/core";
import { injectable, inject } from "inversify";
import { OutputPreferences } from "./output-preferences";

export interface OutputChannel {
    append(value: string): void;
    appendLine(line: string): void;
}

@injectable()
export class OutputChannelManager {
    protected readonly channels = new Map<string, OutputChannelImpl>();

    private readonly channelAddedEmitter = new Emitter<OutputChannelImpl>();
    readonly onChannelAdded = this.channelAddedEmitter.event;

    constructor( @inject(OutputPreferences) protected preferences: OutputPreferences) {
    }

    getChannel(name: string): OutputChannelImpl {
        const existing = this.channels.get(name);
        if (existing) {
            return existing;
        }
        const channel = new OutputChannelImpl(name, this.preferences);
        this.channels.set(name, channel);
        this.channelAddedEmitter.fire(channel);
        return channel;
    }

    getChannels(): OutputChannelImpl[] {
        return Array.from(this.channels.values());
    }
}

export class OutputChannelImpl implements OutputChannel {

    private readonly contentChangeEmitter = new Emitter<OutputChannelImpl>();
    private lines: string[] = [];
    private currentLine: string | undefined;

    readonly onContentChange: Event<OutputChannelImpl> = this.contentChangeEmitter.event;

    constructor(readonly name: string, readonly preferences: OutputPreferences) { }

    append(value: string): void {
        this.currentLine += value;
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

    getLines(): string[] {
        if (this.currentLine !== undefined) {
            return [...this.lines, this.currentLine];
        } else {
            return this.lines;
        }
    }
}
