/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from 'inversify';
import { CommandRegistry } from './command';
import { KeyCode, Accelerator } from './keys';
import { ContributionProvider } from './contribution-provider';
import { ILogger } from "./logger";

export interface Keybinding {
    readonly commandId: string;
    readonly keyCode: KeyCode;
    /**
     * The optional keybinding context where this binding belongs to.
     * If not specified, then this keybinding context belongs to the NOOP
     * keybinding context.
     */
    readonly contextId?: string;
    /**
     * Sugar for showing the keybindings in the menus.
     */
    readonly accelerator?: Accelerator;
}

export const KeybindingContribution = Symbol("KeybindingContribution");
export interface KeybindingContribution {
    registerKeybindings(keybindings: KeybindingRegistry): void;
}

export const KeybindingContext = Symbol("KeybindingContextExtension");
export interface KeybindingContext {
    /**
     * The unique ID of the current context.
     */
    readonly id: string;

    isEnabled(arg: Keybinding): boolean;
}
export namespace KeybindingContexts {

    export const NOOP_CONTEXT: KeybindingContext = {
        id: 'noop.keybinding.context',
        isEnabled: () => true
    };

    export const DEFAULT_CONTEXT: KeybindingContext = {
        id: 'default.keybinding.context',
        isEnabled: () => false
    };
}

@injectable()
export class KeybindingContextRegistry {

    protected readonly contexts: { [id: string]: KeybindingContext } = {};

    constructor(
        @inject(ContributionProvider) @named(KeybindingContext)
        protected readonly contextProvider: ContributionProvider<KeybindingContext>
    ) {
        this.registerContext(KeybindingContexts.NOOP_CONTEXT);
        this.registerContext(KeybindingContexts.DEFAULT_CONTEXT);
    }

    initialize(): void {
        this.contextProvider.getContributions().forEach(context => this.registerContext(context));
    }

    /**
     * Registers the keybinding context arguments into the application. Fails when an already registered
     * context is being registered.
     *
     * @param contexts the keybinding contexts to register into the application.
     */
    registerContext(...contexts: KeybindingContext[]) {
        for (const context of contexts) {
            const { id } = context;
            if (this.contexts[id]) {
                throw new Error(`A keybinding context with ID ${id} is already registered.`);
            }
            this.contexts[id] = context;
        }
    }

    getContext(contextId: string): KeybindingContext | undefined {
        return this.contexts[contextId];
    }
}

@injectable()
export class KeybindingRegistry {

    static readonly PASSTHROUGH_PSEUDO_COMMAND = "passthrough";
    protected readonly keybindings: { [index: string]: Keybinding[] } = {};
    protected readonly commands: { [commandId: string]: Keybinding[] } = {};

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(KeybindingContextRegistry) protected readonly contextRegistry: KeybindingContextRegistry,
        @inject(ContributionProvider) @named(KeybindingContribution)
        protected readonly contributions: ContributionProvider<KeybindingContribution>,
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    onStart(): void {
        for (const contribution of this.contributions.getContributions()) {
            contribution.registerKeybindings(this);
        }
    }

    registerKeybindings(...bindings: Keybinding[]): void {
        for (const binding of bindings) {
            this.registerKeybinding(binding);
        }
    }

    /**
     * Adds a keybinding to the registry.
     *
     * @param binding
     */
    registerKeybinding(binding: Keybinding) {
        const existing = this.keybindings[binding.keyCode.keystroke];
        if (existing) {
            const collided = existing.filter(b => b.contextId === binding.contextId);
            if (collided.length > 0) {
                this.logger.warn(`Collided keybinding is ignored; `, JSON.stringify(binding), ' collided with ', collided.map(b => JSON.stringify(b)).join(', '));
                return;
            }
        }
        const { keyCode, commandId } = binding;
        const bindings = this.keybindings[keyCode.keystroke] || [];
        bindings.push(binding);
        this.keybindings[keyCode.keystroke] = bindings;

        /* Keep a mapping of the Command -> Key mapping.  */
        if (!this.isPseudoCommand(commandId)) {
            const commands = this.commands[commandId] || [];
            commands.push(binding);
            this.commands[commandId] = bindings;
        }
    }

    /**
     * Get the keybindings associated to commandId.
     *
     * @param commandId The ID of the command for which we are looking for keybindings.
     */
    getKeybindingsForCommand(commandId: string): Keybinding[] {
        return this.commands[commandId] || [];
    }

    /**
     * Get the list of keybindings matching keyCode.  The list is sorted by
     * priority (see #sortKeybindingsByPriority).
     *
     * @param keyCode The key code for which we are looking for keybindings.
     */
    getKeybindingsForKeyCode(keyCode: KeyCode): Keybinding[] {
        const bindings = this.keybindings[keyCode.keystroke] || [];

        this.sortKeybindingsByPriority(bindings);

        return bindings;
    }

    /**
     * Sort keybindings in-place, in order of priority.
     *
     * The only criterion right now is that a keybinding with a context has
     * more priority than a keybinding with no context.
     *
     * @param keybindings Array of keybindings to be sorted in-place.
     */
    private sortKeybindingsByPriority(keybindings: Keybinding[]) {
        keybindings.sort((a: Keybinding, b: Keybinding): number => {
            if (a.contextId && !b.contextId) {
                return -1;
            }

            if (!a.contextId && b.contextId) {
                return 1;
            }

            return 0;
        });
    }

    protected isActive(binding: Keybinding): boolean {
        /* Pseudo commands like "passthrough" are always active (and not found
           in the command registry).  */
        if (this.isPseudoCommand(binding.commandId)) {
            return true;
        }

        const command = this.commandRegistry.getCommand(binding.commandId);
        return !!command && !!this.commandRegistry.getActiveHandler(command.id);
    }

    /**
     * Run the command matching to the given keyboard event.
     */
    run(event: KeyboardEvent): void {
        if (event.defaultPrevented) {
            return;
        }

        const keyCode = KeyCode.createKeyCode(event);
        const bindings = this.getKeybindingsForKeyCode(keyCode);

        for (const binding of bindings) {
            const context = binding.contextId
                ? this.contextRegistry.getContext(binding.contextId)
                : undefined;

            /* Only execute if it has no context (global context) or if we're in
               that context.  */
            if (!context || context.isEnabled(binding)) {

                if (this.isPseudoCommand(binding.commandId)) {
                    /* Don't do anything, let the event propagate.  */
                } else {
                    const commandHandler = this.commandRegistry.getActiveHandler(binding.commandId);

                    if (commandHandler) {
                        commandHandler.execute();
                    }

                    /* Note that if a keybinding is in context but the command is
                       not active we still stop the processing here.  */
                    event.preventDefault();
                    event.stopPropagation();
                }

                break;
            }
        }
    }

    /* Return true of string a pseudo-command id, in other words a command id
       that has a special meaning and that we won't find in the command
       registry.  */

    isPseudoCommand(commandId: string): boolean {
        return commandId === KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND;
    }
}
