// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable, inject, named } from 'inversify';
import { Event, Emitter, WaitUntilEvent } from './event';
import { Disposable, DisposableCollection } from './disposable';
import { ContributionProvider } from './contribution-provider';
import { nls } from './nls';
import debounce = require('p-debounce');
import { MaybePromise } from './types';

/**
 * This type represents a command id's string but has its arguments and return type information attached to it.
 */
export type CommandId<Arguments extends any[], ReturnType> = string & {
    /**
     * @internal For typing only. This field will never be defined.
     */
    __typedCommandId: [Arguments, ReturnType];
};

/**
 * A command is a unique identifier of a function
 * which can be executed by a user via a keyboard shortcut,
 * a menu action or directly.
 */
export interface Command<Id extends string = string> {
    /**
     * A unique identifier of this command.
     */
    id: Id;
    /**
     * A label of this command.
     */
    label?: string;
    originalLabel?: string;
    /**
     * An icon class of this command.
     */
    iconClass?: string;
    /**
     * A category of this command.
     */
    category?: string;
    originalCategory?: string;
}

export namespace Command {

    /**
     * @internal
     *
     * Return the argument tuple from {@link CommandId} or typed {@link Command}, otherwise return `any[]`.
     */
    export type Arguments<T> = T extends CommandId<infer A1, any> ? A1 : T extends Command<infer Id> ? Arguments<Id> : any[];

    /**
     * @internal
     *
     * Return the return type from {@link CommandId} or typed {@link Command}, otherwise return `any`.
     */
    export type ReturnType<T> = T extends CommandId<any, infer R1> ? R1 : T extends Command<infer Id> ? ReturnType<Id> : any;

    /**
     * @internal
     *
     * Return a typed {@link CommandHandler} with the same arguments and return type as {@link CommandId} or typed {@link Command},
     * otherwise return {@link CommandHandler}.
     */
    export type Handler<T> = T extends CommandId<infer A1, infer R1>
        ? CommandHandler<A1, R1>
        : T extends Command<infer Id>
        ? Handler<Id>
        : CommandHandler;

    /**
     * Type cast a `string` into {@link CommandId}.
     */
    export function asCommandId<A extends any[], R>(id: string): CommandId<A, R> {
        return id as CommandId<A, R>;
    }

    /* Determine whether object is a Command */
    export function is(arg: unknown): arg is Command {
        return !!arg && typeof arg === 'object' && 'id' in arg;
    }

    export function as<A extends any[], R = any>(command: Command<string>): Command<CommandId<A, R>> {
        return command as Command<CommandId<A, R>>;
    }

    /**
     * Use this to extend {@link command}'s typings to support a supplementary signature.
     *
     * This will return {@link command} as-is but with the new typings.
     *
     * @example
     *
     * const extended = Command.extend(original).as<NewArguments, NewReturnType>();
     */
    export function extend<Cmd extends Command>(command: Cmd): {
        as<A extends any[], R>(): Command<CommandId<Arguments<Cmd> | A, ReturnType<Cmd> | R>>
    } {
        return {
            as: () => as(command)
        };
    }

    /**
     * Utility function to easily translate commands.
     */
    export function toLocalizedCommand(command: Command, nlsLabelKey?: string, nlsCategoryKey?: string): Command;
    export function toLocalizedCommand<A extends any[] = any, R = any>(command: Command, nlsLabelKey?: string, nlsCategoryKey?: string): Command<CommandId<A, R>>;
    export function toLocalizedCommand(command: Command, nlsLabelKey: string = command.id, nlsCategoryKey?: string): Command {
        return {
            ...command,
            label: command.label && nls.localize(nlsLabelKey, command.label),
            originalLabel: command.label,
            category: nlsCategoryKey && command.category && nls.localize(nlsCategoryKey, command.category) || command.category,
            originalCategory: command.category,
        };
    }

    /**
     * Utility function to easily translate commands.
     */
    export function toDefaultLocalizedCommand(command: Command): Command;
    export function toDefaultLocalizedCommand<A extends any[] = any, R = any>(command: Command): Command<CommandId<A, R>>;
    export function toDefaultLocalizedCommand(command: Command): Command {
        return {
            ...command,
            label: command.label && nls.localizeByDefault(command.label),
            originalLabel: command.label,
            category: command.category && nls.localizeByDefault(command.category),
            originalCategory: command.category,
        };
    }

    /** Comparator function for when sorting commands */
    export function compareCommands(a: Command, b: Command): number {
        if (a.label && b.label) {
            const aCommand = (a.category ? `${a.category}: ${a.label}` : a.label).toLowerCase();
            const bCommand = (b.category ? `${b.category}: ${b.label}` : b.label).toLowerCase();
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
export interface CommandHandler<Arguments extends any[] = any, ReturnType = any> {
    /**
     * Execute this handler.
     *
     * Don't call it directly, use `CommandService.executeCommand` instead.
     */
    execute(...args: Arguments): MaybePromise<ReturnType>;
    /**
     * Test whether this handler is enabled (active).
     *
     * Return value will be tested for truthfulness.
     */
    isEnabled?(...args: Arguments): unknown;
    /**
     * Test whether menu items for this handler should be visible.
     *
     * Return value will be tested for truthfulness.
     */
    isVisible?(...args: Arguments): unknown;
    /**
     * Test whether menu items for this handler should be toggled.
     *
     * Return value will be tested for truthfulness.
     */
    isToggled?(...args: Arguments): unknown;
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

export interface CommandEvent {
    commandId: string;
    args: any[]
}

export interface WillExecuteCommandEvent extends WaitUntilEvent, CommandEvent {
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
    executeCommand<T extends Command.ReturnType<Id>, Id extends string>(command: Id, ...args: Command.Arguments<Id>): Promise<T | undefined>;
    /**
     * An event is emitted when a command is about to be executed.
     *
     * It can be used to install or activate a command handler.
     */
    readonly onWillExecuteCommand: Event<WillExecuteCommandEvent>;
    /**
     * An event is emitted when a command was executed.
     */
    readonly onDidExecuteCommand: Event<CommandEvent>;
}

/**
 * The command registry manages commands and handlers.
 */
@injectable()
export class CommandRegistry implements CommandService {

    protected readonly _commands: { [id: string]: Command } = {};
    protected readonly _handlers: { [id: string]: CommandHandler[] } = {};

    protected readonly toUnregisterCommands = new Map<string, Disposable>();

    // List of recently used commands.
    protected _recent: string[] = [];

    protected readonly onWillExecuteCommandEmitter = new Emitter<WillExecuteCommandEvent>();
    readonly onWillExecuteCommand = this.onWillExecuteCommandEmitter.event;

    protected readonly onDidExecuteCommandEmitter = new Emitter<CommandEvent>();
    readonly onDidExecuteCommand = this.onDidExecuteCommandEmitter.event;

    protected readonly onCommandsChangedEmitter = new Emitter<void>();
    readonly onCommandsChanged = this.onCommandsChangedEmitter.event;

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

    *getAllCommands(): IterableIterator<Readonly<Command & { handlers: CommandHandler[] }>> {
        for (const command of Object.values(this._commands)) {
            yield { ...command, handlers: this._handlers[command.id] ?? [] };
        }
    }

    /**
     * Register the given command and handler if present.
     *
     * Throw if a command is already registered for the given command identifier.
     */
    registerCommand<Cmd extends Command>(command: Cmd, handler?: Command.Handler<Cmd>): Disposable {
        if (this._commands[command.id]) {
            console.warn(`A command ${command.id} is already registered.`);
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection(this.doRegisterCommand(command));
        if (handler) {
            toDispose.push(this.registerHandler(command.id, handler));
        }
        this.toUnregisterCommands.set(command.id, toDispose);
        toDispose.push(Disposable.create(() => this.toUnregisterCommands.delete(command.id)));
        return toDispose;
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
     * Unregister command from the registry by command object.
     *
     * @param command
     */
    unregisterCommand(command: Command): void;
    /**
     * Unregister command from the registry by id.
     *
     * @param id
     */
    unregisterCommand(id: string): void;
    unregisterCommand(commandOrId: Command | string): void {
        const id = Command.is(commandOrId) ? commandOrId.id : commandOrId;
        const toUnregister = this.toUnregisterCommands.get(id);
        if (toUnregister) {
            toUnregister.dispose();
        }
    }

    /**
     * Register the given handler for the given command identifier.
     *
     * If there is already a handler for the given command
     * then the given handler is registered as more specific, and
     * has higher priority during enablement, visibility and toggle state evaluations.
     */
    registerHandler<Id extends string>(command: Id, handler: Command.Handler<Id>): Disposable {
        let handlers = this._handlers[command];
        if (!handlers) {
            this._handlers[command] = handlers = [];
        }
        handlers.unshift(handler);
        this.fireDidChange();
        return {
            dispose: () => {
                const idx = handlers.indexOf(handler);
                if (idx >= 0) {
                    handlers.splice(idx, 1);
                    this.fireDidChange();
                }
            }
        };
    }

    protected fireDidChange = debounce(() => this.doFireDidChange(), 0);

    protected doFireDidChange(): void {
        this.onCommandsChangedEmitter.fire();
    }

    /**
     * Test whether there is an active handler for the given command.
     */
    isEnabled<Id extends string>(command: Id, ...args: Command.Arguments<Id>): boolean {
        return typeof this.getActiveHandler(command, ...args) !== 'undefined';
    }

    /**
     * Test whether there is a visible handler for the given command.
     */
    isVisible<Id extends string>(command: Id, ...args: Command.Arguments<Id>): boolean {
        return typeof this.getVisibleHandler(command, ...args) !== 'undefined';
    }

    /**
     * Test whether there is a toggled handler for the given command.
     */
    isToggled<Id extends string>(command: Id, ...args: Command.Arguments<Id>): boolean {
        return typeof this.getToggledHandler(command, ...args) !== 'undefined';
    }

    /**
     * Execute the active handler for the given command and arguments.
     *
     * Reject if a command cannot be executed.
     */
    async executeCommand<T extends Command.ReturnType<Id>, Id extends string = string>(command: Id, ...args: Command.Arguments<Id>): Promise<T | undefined> {
        const handler = this.getActiveHandler(command as string, ...args);
        if (handler) {
            await this.fireWillExecuteCommand(command, args);
            const result = await handler.execute(...args);
            this.onDidExecuteCommandEmitter.fire({ commandId: command, args });
            return result;
        }
        throw Object.assign(
            new Error(`The command '${command}' cannot be executed. There are no active handlers available for the command.`),
            { code: 'NO_ACTIVE_HANDLER' }
        );
    }

    protected async fireWillExecuteCommand(commandId: string, args: any[] = []): Promise<void> {
        await WaitUntilEvent.fire(this.onWillExecuteCommandEmitter, { commandId, args }, 30000);
    }

    /**
     * Get a visible handler for the given command or `undefined`.
     */
    getVisibleHandler<Id extends string>(command: Id, ...args: Command.Arguments<Id>): Command.Handler<Id> | undefined {
        const handlers = this._handlers[command];
        if (handlers) {
            for (const handler of handlers) {
                try {
                    if (!handler.isVisible || handler.isVisible(...args)) {
                        return handler as Command.Handler<Id>;
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        }
        return undefined;
    }

    /**
     * Get an active handler for the given command or `undefined`.
     */
    getActiveHandler<Id extends string>(command: Id, ...args: Command.Arguments<Id>): Command.Handler<Id> | undefined {
        const handlers = this._handlers[command];
        if (handlers) {
            for (const handler of handlers) {
                try {
                    if (!handler.isEnabled || handler.isEnabled(...args)) {
                        return handler as Command.Handler<Id>;
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        }
        return undefined;
    }

    /**
     * Get a toggled handler for the given command or `undefined`.
     */
    getToggledHandler<Id extends string>(command: Id, ...args: Command.Arguments<Id>): Command.Handler<Id> | undefined {
        const handlers = this._handlers[command];
        if (handlers) {
            for (const handler of handlers) {
                try {
                    if (handler.isToggled && handler.isToggled(...args)) {
                        return handler as Command.Handler<Id>;
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        }
        return undefined;
    }

    /**
     * Returns with all handlers for the given command. If the command does not have any handlers,
     * or the command is not registered, returns an empty array.
     */
    getAllHandlers<Id extends string>(command: Id): Command.Handler<Id>[] {
        const handlers = this._handlers[command] as Command.Handler<Id>[] | undefined;
        return handlers ? handlers.slice() : [];
    }

    /**
     * Get all registered commands.
     */
    get commands(): Command[] {
        return Object.values(this._commands);
    }

    /**
     * Get a command for the given command identifier.
     */
    getCommand<Id extends string>(id: Id): Command<Id> | undefined {
        return this._commands[id] as Command<Id>;
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
        const commands: Command[] = [];
        for (const recentId of this._recent) {
            const command = this.getCommand(recentId);
            if (command) {
                commands.push(command);
            }
        }
        return commands;
    }

    /**
     * Set the list of recently used commands.
     * @param commands the list of recently used commands.
     */
    set recent(commands: Command[]) {
        this._recent = Array.from(new Set(commands.map(e => e.id)));
    }

    /**
     * Adds a command to recently used list.
     * Prioritizes commands that were recently executed to be most recent.
     *
     * @param recent a recent command, or array of recent commands.
     */
    addRecentCommand(recent: Command | Command[]): void {
        for (const recentCommand of Array.isArray(recent) ? recent : [recent]) {
            // Determine if the command currently exists in the recently used list.
            const index = this._recent.findIndex(commandId => commandId === recentCommand.id);
            // If the command exists, remove it from the array so it can later be placed at the top.
            if (index >= 0) { this._recent.splice(index, 1); }
            // Add the recent command to the beginning of the array (most recent).
            this._recent.unshift(recentCommand.id);
        }
    }

    /**
     * Clear the list of recently used commands.
     */
    clearCommandHistory(): void {
        this.recent = [];
    }
}
