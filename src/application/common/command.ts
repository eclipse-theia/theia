/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { Disposable, DisposableCollection } from "./disposable";
import { ContributionProvider } from './contribution-provider';

export interface Command {
    id: string;
    label?: string;
    iconClass?: string;
}
export interface CommandHandler {
    execute(...args: any[]): any;
    isEnabled?(...args: any[]): boolean;
    isVisible?(...args: any[]): boolean;
}

export const CommandContribution = Symbol("CommandContribution");

export interface CommandContribution {
    registerCommands(commands: CommandRegistry): void;
}

export const CommandService = Symbol("CommandService");
export interface CommandService {
    /**
     * Reject if a command cannot be executed.
     */
    executeCommand<T>(command: string, ...args: any[]): Promise<T | undefined>;
}

@injectable()
export class CommandRegistry implements CommandService {

    private _commands: { [id: string]: Command } | undefined;
    private _handlers: { [id: string]: CommandHandler[] } | undefined;

    constructor(
        @inject(ContributionProvider) @named(CommandContribution)
        protected readonly contributionProvider: ContributionProvider<CommandContribution>
    ) { }

    activate(): Disposable {
        this._commands = {};
        this._handlers = {};
        const contributions = this.contributionProvider.getContributions();
        for (const contrib of contributions) {
            contrib.registerCommands(this);
        }
        return Disposable.create(() => {
            this._commands = undefined;
            this._handlers = undefined;
        });
    }

    protected getCommands(): { [id: string]: Command } {
        if (this._commands) {
            return this._commands;
        }
        throw new Error('The command registry is not initialized');
    }

    protected getHandlers(): { [id: string]: CommandHandler[] } {
        if (this._handlers) {
            return this._handlers;
        }
        throw new Error('The command registry is not initialized');
    }

    registerCommand(command: Command, handler?: CommandHandler): Disposable {
        if (handler) {
            const toDispose = new DisposableCollection();
            toDispose.push(this.doRegisterCommand(command));
            toDispose.push(this.registerHandler(command.id, handler));
            return toDispose;
        }
        return this.doRegisterCommand(command);
    }

    protected doRegisterCommand(command: Command): Disposable {
        const commands = this.getCommands();
        if (commands[command.id]) {
            throw Error(`A command ${command.id} is already registered.`);
        }
        commands[command.id] = command;
        return {
            dispose: () => {
                delete commands[command.id];
            }
        }
    }

    registerHandler(commandId: string, handler: CommandHandler): Disposable {
        const allHandlers = this.getHandlers();
        let handlers = allHandlers[commandId];
        if (!handlers) {
            allHandlers[commandId] = handlers = [];
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

    executeCommand<T>(command: string, ...args: any[]): Promise<T | undefined> {
        const handler = this.getActiveHandler(command, ...args);
        if (handler) {
            return Promise.resolve(handler.execute(...args))
        }
        return Promise.reject(`command '${command}' cannot be executed`);
    }

    getActiveHandler(commandId: string, ...args: any[]): CommandHandler | undefined {
        const handlers = this.getHandlers()[commandId];
        if (handlers) {
            for (const handler of handlers) {
                if (!handler.isEnabled || handler.isEnabled(...args)) {
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
                commands.push(cmd);
            }
        }
        return commands;
    }

    getCommand(id: string): Command | undefined {
        return this.getCommands()[id];
    }

    get commandIds(): string[] {
        return Object.keys(this._commands);
    }
}
