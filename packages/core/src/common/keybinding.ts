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
    readonly context?: KeybindingContext;
    /**
     * Sugar for showing the keybindings in the menus.
     */
    readonly accelerator?: Accelerator;
}

export interface RawKeybinding {
    command: string;
    keybinding: string;
    context?: string;
    args?: string[];
}

export const KeybindingContribution = Symbol("KeybindingContribution");
export interface KeybindingContribution {
    registerKeyBindings(keybindings: KeybindingRegistry): void;
}

export const KeybindingContext = Symbol("KeybindingContextExtension");
export interface KeybindingContext {
    /**
     * The unique ID of the current context.
     */
    readonly id: string;

    isEnabled(arg?: Keybinding): boolean;
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

    protected keybindings: { [index: string]: Keybinding[] } = {};
    protected defaultKeyBindings: { [index: string]: Keybinding[] };
    protected commands: { [commandId: string]: Keybinding[] } = {};
    protected defaultCommands: { [commandId: string]: Keybinding[] } = {};

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(KeybindingContextRegistry) protected readonly contextRegistry: KeybindingContextRegistry,
        @inject(ContributionProvider) @named(KeybindingContribution)
        protected readonly contributions: ContributionProvider<KeybindingContribution>,
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    onStart(): void {
        for (const contribution of this.contributions.getContributions()) {
            contribution.registerKeyBindings(this);
        }
    }

    registerKeybindings(...bindings: Keybinding[]): void {
        for (const binding of bindings) {
            this.registerKeyBinding(binding);
        }
    }

    /**
     * Adds a keybinding to the registry.
     *
     * @param binding
     */
    registerKeyBinding(binding: Keybinding) {
        const existing = this.keybindings[binding.keyCode.keystroke];
        if (existing) {
            const collided = existing.filter(b => b.context === binding.context);
            if (collided.length > 0) {
                this.logger.warn(`Collided keybinding is ignored; `, JSON.stringify(binding), ' collided with ', collided.map(b => JSON.stringify(b)).join(', '));
                return;
            }
        }
        const { keyCode, commandId } = binding;
        const bindings = this.keybindings[keyCode.keystroke] || [];
        bindings.push(binding);
        this.keybindings[keyCode.keystroke] = bindings;

        const commands = this.commands[commandId] || [];
        commands.push(binding);
        this.commands[commandId] = commands;
    }

    unregisterKeybindings(bindingsToRemove: Keybinding[]) {
        for (const bindingToRemove of bindingsToRemove) {
            const { keyCode, commandId } = bindingToRemove;
            let bindings = this.keybindings[keyCode.keystroke] || [];

            bindings = bindings.filter(binding => binding !== bindingToRemove);
            this.keybindings[keyCode.keystroke] = bindings;

            let commands = this.commands[commandId] || [];
            commands = commands.filter(command => command !== bindingToRemove);
            this.commands[commandId] = commands;
        }
    }

    /**
     * The `active` flag with `false` could come handy when we do not want to check whether the command is currently active or not.
     * For instance, when building the main menu, it could easily happen that the command is not yet active (no active editors and so on)
     * but still, we have to build the key accelerator.
     *
     * @param commandId the unique ID of the command for we the associated ke binding are looking for.
     * @param options if `active` is false` then the availability of the command will not be checked. Default is `true`
     */
    getKeybindingsForCommand(commandId: string, options: { active: boolean } = ({ active: true })): Keybinding[] | undefined {
        const bindings = this.commands[commandId];
        if (!bindings || bindings.length === 0) {
            return undefined;
        }
        if (!options.active) {
            return bindings;
        }

        return bindings.filter(filter => {
            this.isActive.bind(filter);
        });
    }

    /**
     * @param keyCode the key code of the binding we are searching.
     */
    getKeybindingForKeyCode(keyCode: KeyCode, options: { active: boolean } = ({ active: true })): Keybinding | undefined {
        const bindings = this.keybindings[keyCode.keystroke];
        if (!bindings) {
            return undefined;
        }
        if (!options.active) {
            return bindings[0];
        }
        return bindings.find(this.isActive.bind(this));
    }

    protected isActive(binding: Keybinding): boolean {
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
        const binding = this.getKeybindingForKeyCode(keyCode);
        if (!binding) {
            return;
        }
        const context = binding.context || KeybindingContexts.NOOP_CONTEXT;
        if (context && context.isEnabled(binding)) {
            const handler = this.commandRegistry.getActiveHandler(binding.commandId);
            if (handler) {
                event.preventDefault();
                event.stopPropagation();
                handler.execute();
            }
        }
    }

    setKeymap(rawKeyBindings: RawKeybinding[]) {
        /* Only assign the default keybindings once, so that they do not get overridden with further iterations */
        if (!this.defaultKeyBindings || !this.defaultCommands) {
            this.defaultKeyBindings = Object.assign({}, this.keybindings);
            this.defaultCommands = Object.assign({}, this.commands);
        }
        let invalidKeyMap: boolean = false;
        for (const rawKeyBinding of rawKeyBindings) {
            if (this.commandRegistry.getCommand(rawKeyBinding.command)) {
                // TODO check if valid context? valid keybinding?
                // Create Keycode from string?
                // Create new Keybinding and assign it
                // If one keybinding is wrong, reset to the default ones.

                const code = KeyCode.parseKeystroke(rawKeyBinding.keybinding);
                if (code) {

                    const oldBindings = this.getKeybindingsForCommand(rawKeyBinding.command, { active: false });
                    if (oldBindings) {
                        this.unregisterKeybindings(oldBindings);
                    }

                    let context: KeybindingContext | undefined;
                    if (rawKeyBinding.context) {
                        context = this.contextRegistry.getContext(rawKeyBinding.context);
                    }

                    this.registerKeyBinding({
                        commandId: rawKeyBinding.command,
                        keyCode: code,
                        context: context ? context : undefined
                    });

                } else {
                    invalidKeyMap = true;
                    break;
                }
            } else {
                invalidKeyMap = true;
                break;
            }
        }

        if (invalidKeyMap) {
            this.keybindings = Object.assign({}, this.defaultKeyBindings);
            this.commands = Object.assign({}, this.defaultCommands);
        }
    }
}
