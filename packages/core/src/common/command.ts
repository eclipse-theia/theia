/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, named } from 'inversify';
import { Disposable, DisposableCollection } from './disposable';
import { ContributionProvider } from './contribution-provider';

/**
 * A command is a unique identifier of a function
 * which can be executed by a user via a keyboard shortcut,
 * a menu action or directly.
 */
export interface Command {
    /**
     * A unique identifier of this command.
     */
    id: string;
    /**
     * A label of this command.
     */
    label?: string;
    /**
     * An icon class of this command.
     */
    iconClass?: string;
    /**
     * A category of this command.
     */
    category?: string;
}

export namespace Command {
    /* Determine whether object is a Command */
    // tslint:disable-next-line:no-any
    export function is(arg: Command | any): arg is Command {
        return !!arg && arg === Object(arg) && 'id' in arg;
    }

    /** Comparator function for when sorting commands */
    export function compareCommands(a: Command, b: Command): number {
        if (a.label && b.label) {
            const aCommand = (a.category) ? a.category + a.label : a.label;
            const bCommand = (b.category) ? b.category + b.label : b.label;
            return (aCommand).localeCompare(bCommand);
        } else {
            return 0;
        }
    }

    /**
     * Determine if two commands are equal.
     *
     * @param a the first command for comparison.
     * @param b the second command for comparison.
     */
    export function equals(a: Command, b: Command): boolean {
        return (
            a.id === b.id &&
            a.label === b.label &&
            a.iconClass === b.iconClass &&
            a.category === b.category
        );
    }
}

/**
 * A command handler is an implementation of a command.
 *
 * A command can have multiple handlers
 * but they should be active in different contexts,
 * otherwise first active will be executed.
 */
export interface CommandHandler {
    /**
     * Execute this handler.
     */
    // tslint:disable-next-line:no-any
    execute(...args: any[]): any;
    /**
     * Test whether this handler is enabled (active).
     */
    // tslint:disable-next-line:no-any
    isEnabled?(...args: any[]): boolean;
    /**
     * Test whether menu items for this handler should be visible.
     */
    // tslint:disable-next-line:no-any
    isVisible?(...args: any[]): boolean;
    /**
     * Test whether menu items for this handler should be toggled.
     */
    // tslint:disable-next-line:no-any
    isToggled?(...args: any[]): boolean;
}

export const CommandContribution = Symbol('CommandContribution');
/**
 * The command contribution should be implemented to register custom commands and handler.
 */
export interface CommandContribution {
    /**
     * Register commands and handlers.
     */
    registerCommands(commands: CommandRegistry): void;
}

export const commandServicePath = '/services/commands';
export const CommandService = Symbol('CommandService');
/**
 * The command service should be used to execute commands.
 */
export interface CommandService {
    /**
     * Execute the active handler for the given command and arguments.
     *
     * Reject if a command cannot be executed.
     */
    // tslint:disable-next-line:no-any
    executeCommand<T>(command: string, ...args: any[]): Promise<T | undefined>;
}

/**
 * The command registry manages commands and handlers.
 */
@injectable()
export class CommandRegistry implements CommandService {

    protected readonly _commands: { [id: string]: Command } = {};
    protected readonly _handlers: { [id: string]: CommandHandler[] } = {};

    // List of recently used commands.
    protected _recent: Command[] = [];

    constructor(
        @inject(ContributionProvider) @named(CommandContribution)
        protected readonly contributionProvider: ContributionProvider<CommandContribution>
    ) { }

    onStart(): void {
        const contributions = this.contributionProvider.getContributions();
        for (const contrib of contributions) {
            contrib.registerCommands(this);
        }
    }

    /**
     * Register the given command and handler if present.
     *
     * Throw if a command is already registered for the given command identifier.
     */
    registerCommand(command: Command, handler?: CommandHandler): Disposable {
        if (this._commands[command.id]) {
            console.warn(`A command ${command.id} is already registered.`);
            return Disposable.NULL;
        }
        if (handler) {
            const toDispose = new DisposableCollection();
            toDispose.push(this.doRegisterCommand(command));
            toDispose.push(this.registerHandler(command.id, handler));
            return toDispose;
        }
        return this.doRegisterCommand(command);
    }

    protected doRegisterCommand(command: Command): Disposable {
        this._commands[command.id] = command;
        return {
            dispose: () => {
                delete this._commands[command.id];
            }
        };
    }

    /**
     * Unregister command from the registry
     *
     * @param command
     */
    unregisterCommand(command: Command): void;
    /**
     * Unregister command from the registry
     *
     * @param id
     */
    unregisterCommand(id: string): void;
    unregisterCommand(commandOrId: Command | string): void {
        const id = Command.is(commandOrId) ? commandOrId.id : commandOrId;

        if (this._commands[id]) {
            delete this._commands[id];
        }
    }

    /**
     * Register the given handler for the given command identifier.
     */
    registerHandler(commandId: string, handler: CommandHandler): Disposable {
        let handlers = this._handlers[commandId];
        if (!handlers) {
            this._handlers[commandId] = handlers = [];
        }
        handlers.push(handler);
        return {
            dispose: () => {
                const idx = handlers.indexOf(handler);
                if (idx >= 0) {
                    handlers.splice(idx, 1);
                }
            }
        };
    }

    /**
     * Test whether there is an active handler for the given command.
     */
    // tslint:disable-next-line:no-any
    isEnabled(command: string, ...args: any[]): boolean {
        return this.getActiveHandler(command, ...args) !== undefined;
    }

    /**
     * Test whether there is a visible handler for the given command.
     */
    // tslint:disable-next-line:no-any
    isVisible(command: string, ...args: any[]): boolean {
        return this.getVisibleHandler(command, ...args) !== undefined;
    }

    /**
     * Test whether there is a toggled handler for the given command.
     */
    // tslint:disable-next-line:no-any
    isToggled(command: string, ...args: any[]): boolean {
        const handler = this.getToggledHandler(command);
        return handler && handler.isToggled ? handler.isToggled(...args) : false;
    }

    /**
     * Execute the active handler for the given command and arguments.
     *
     * Reject if a command cannot be executed.
     */
    // tslint:disable-next-line:no-any
    async executeCommand<T>(commandId: string, ...args: any[]): Promise<T | undefined> {
        const handler = this.getActiveHandler(commandId, ...args);
        if (handler) {
            const result = await handler.execute(...args);
            const command = this.getCommand(commandId);
            if (command) {
                this.addRecentCommand(command);
            }
            return result;
        }
        const argsMessage = args && args.length > 0 ? ` (args: ${JSON.stringify(args)})` : '';
        throw new Error(`The command '${commandId}' cannot be executed. There are no active handlers available for the command.${argsMessage}`);
    }

    /**
     * Get a visible handler for the given command or `undefined`.
     */
    // tslint:disable-next-line:no-any
    getVisibleHandler(commandId: string, ...args: any[]): CommandHandler | undefined {
        const handlers = this._handlers[commandId];
        if (handlers) {
            for (const handler of handlers) {
                if (!handler.isVisible || handler.isVisible(...args)) {
                    return handler;
                }
            }
        }
        return undefined;
    }

    /**
     * Get an active handler for the given command or `undefined`.
     */
    // tslint:disable-next-line:no-any
    getActiveHandler(commandId: string, ...args: any[]): CommandHandler | undefined {
        const handlers = this._handlers[commandId];
        if (handlers) {
            for (const handler of handlers) {
                if (!handler.isEnabled || handler.isEnabled(...args)) {
                    return handler;
                }
            }
        }
        return undefined;
    }

    /**
     * Get a toggled handler for the given command or `undefined`.
     */
    getToggledHandler(commandId: string): CommandHandler | undefined {
        const handlers = this._handlers[commandId];
        if (handlers) {
            for (const handler of handlers) {
                if (handler.isToggled) {
                    return handler;
                }
            }
        }
        return undefined;
    }

    /**
     * Get all registered commands.
     */
    get commands(): Command[] {
        const commands: Command[] = [];
        for (const id of this.commandIds) {
            const cmd = this.getCommand(id);
            if (cmd) {
                commands.push(cmd);
            }
        }
        return commands;
    }

    /**
     * Get a command for the given command identifier.
     */
    getCommand(id: string): Command | undefined {
        return this._commands[id];
    }

    /**
     * Get all registered commands identifiers.
     */
    get commandIds(): string[] {
        return Object.keys(this._commands);
    }

    /**
     * Get the list of recently used commands.
     */
    get recent(): Command[] {
        return this._recent;
    }

    /**
     * Set the list of recently used commands.
     * @param commands the list of recently used commands.
     */
    set recent(commands: Command[]) {
        this._recent = commands;
    }

    /**
     * Adds a command to recently used list.
     * Prioritizes commands that were recently executed to be most recent.
     *
     * @param recent a recent command, or array of recent commands.
     */
    addRecentCommand(recent: Command | Command[]): void {
        if (Array.isArray(recent)) {
            recent.forEach((command: Command) => this.addRecentCommand(command));
        } else {
            // Determine if the command currently exists in the recently used list.
            const index = this._recent.findIndex((command: Command) => Command.equals(recent, command));
            // If the command exists, remove it from the array so it can later be placed at the top.
            if (index >= 0) { this._recent.splice(index, 1); }
            // Add the recent command to the beginning of the array (most recent).
            this._recent.unshift(recent);
        }
    }

    /**
     * Clear the list of recently used commands.
     */
    clearCommandHistory(): void {
        this.recent = [];
    }

}
