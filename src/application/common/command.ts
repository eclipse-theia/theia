/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable } from "./disposable";
import { injectable, inject } from "inversify";

export interface Command {
    id: string;
    label: string;
    iconClass?: string;
}
export interface CommandHandler {
    execute(): any;
    isEnabled(): boolean;
    isVisible?(): boolean;
}

export const CommandContribution = Symbol("CommandContribution");

export interface CommandContribution {
    contribute(registry: CommandRegistry): void;
}

export const CommandContributionProvider = Symbol("CommandContributionProvider");

@injectable()
export class CommandRegistry {

    private _commands: { [id: string]: Command };
    private _handlers: { [id: string]: CommandHandler[] };

    constructor(@inject(CommandContributionProvider) private contributionProvider: () => CommandContribution[]) {
    }

    initialize(): void {
        this._commands = {};
        this._handlers = {};
        const contributions = this.contributionProvider();
        for (let contrib of contributions) {
            contrib.contribute(this);
        }
    }

    registerCommand(command: Command): Disposable {
        if (this._commands[command.id]) {
            throw Error(`A command ${command.id} is already registered.`);
        }
        this._commands[command.id] = command;
        return {
            dispose: () => {
                delete this._commands[command.id];
            }
        }
    }

    registerHandler(commandId: string, handler: CommandHandler): Disposable {
        let handlers = this._handlers[commandId];
        if (!handlers) {
            this._handlers[commandId] = handlers = [];
        }
        handlers.push(handler);
        return {
            dispose: () => {
                let idx = handlers.indexOf(handler);
                if (idx >= 0) {
                    handlers.splice(idx, 1);
                }
            }
        }
    }

    getActiveHandler(commandId: string): CommandHandler | undefined {
        const handlers = this._handlers[commandId];
        if (handlers) {
            for (let handler of handlers) {
                if (handler.isEnabled()) {
                    return handler;
                }
            }
        }
        return undefined;
    }

    get commands(): Command[] {
        let commands: Command[] = []
        for (let id of this.commandIds) {
            let cmd = this.getCommand(id);
            if (cmd) {
                commands.push();
            }
        }
        return commands;
    }

    getCommand(id: string): Command | undefined {
        return this._commands[id];
    }

    get commandIds(): string[] {
        return Object.keys(this._commands);
    }
}
