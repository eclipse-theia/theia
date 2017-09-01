/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Context } from './context';
import { Disposable } from './disposable';
import { CommandRegistry } from './command';
import { injectable, inject, named } from 'inversify';
import { KeyCode, Accelerator } from './keys';
import { ContributionProvider } from './contribution-provider';

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
};

export const KeybindingContribution = Symbol("KeybindingContribution");
export interface KeybindingContribution {
    registerKeyBindings(keybindings: KeybindingRegistry): void;
}

export const KeybindingContext = Symbol("KeybindingContextExtension")
export interface KeybindingContext extends Context<Keybinding> { }
export namespace KeybindingContexts {

    export const NOOP_CONTEXT: Context<Keybinding> = {
        id: 'noop.keybinding.context',
        isEnabled(arg?: Keybinding): boolean {
            return true;
        }
    }

    export const DEFAULT_CONTEXT: Context<Keybinding> = {
        id: 'default.keybinding.context',
        isEnabled(arg?: Keybinding): boolean {
            return false;
        }
    }
}


@injectable()
export class KeybindingContextRegistry {

    contexts: { [id: string]: KeybindingContext } = {};
    contextHierarchy: { [id: string]: KeybindingContext };

    constructor( @inject(ContributionProvider) @named(KeybindingContext) private contextProvider: ContributionProvider<KeybindingContext>) {
        this.registerContext(KeybindingContexts.NOOP_CONTEXT)
        this.registerContext(KeybindingContexts.DEFAULT_CONTEXT)
    }

    initialize() {
        this.contextProvider.getContributions().forEach(context => this.registerContext(context));
    }

    /**
     * Registers the keybinding context arguments into the application. Fails when an already registered
     * context is being registered.
     *
     * @param context the keybinding contexts to register into the application.
     */
    registerContext(...context: KeybindingContext[]) {
        if (context.length > 0) {
            context.forEach(context => {
                const { id } = context;
                if (this.contexts[id]) {
                    throw new Error(`A keybinding context with ID ${id} is already registered.`);
                }
                this.contexts[id] = context;
            })
        }
    }

    getContext(contextId: string): KeybindingContext | undefined {
        return this.contexts[contextId];
    }

}

@injectable()
export class KeybindingRegistry {

    protected readonly keybindings: { [index: string]: Keybinding[] } = {};
    protected readonly commands: { [commandId: string]: Keybinding[] } = {};

    constructor(
        @inject(CommandRegistry) protected commandRegistry: CommandRegistry,
        @inject(KeybindingContextRegistry) protected contextRegistry: KeybindingContextRegistry,
        @inject(ContributionProvider) @named(KeybindingContribution) protected contributions: ContributionProvider<KeybindingContribution>) {

        new KeyEventEmitter(commandRegistry, this);
    }

    onStart(): void {
        for (const contribution of this.contributions.getContributions()) {
            contribution.registerKeyBindings(this);
        }
    }

    /**
     * Adds a keybinding to the registry.
     *
     * @param binding
     */
    registerKeyBinding(binding: Keybinding) {
        const { keyCode, commandId } = binding;
        const bindings = this.keybindings[keyCode.keystroke] || [];
        bindings.push(binding);
        this.keybindings[keyCode.keystroke] = bindings;

        const commands = this.commands[commandId] || [];
        commands.push(binding);
        this.commands[commandId] = bindings;
    }

    /**
     * The `active` flag with `false` could come handy when we do not want to check whether the command is currently active or not.
     * For instance, when building the main menu, it could easily happen that the command is not yet active (no active editors and so on)
     * but still, we have to build the key accelerator.
     *
     * @param commandId the unique ID of the command for we the associated ke binding are looking for.
     * @param options if `active` is false` then the availability of the command will not be checked. Default is `true`
     */
    getKeybindingForCommand(commandId: string, options: { active: boolean } = ({ active: true })): Keybinding | undefined {
        const bindings = this.commands[commandId];
        if (!bindings) {
            return undefined;
        }
        if (!options.active) {
            return bindings[0];
        }
        return bindings.find(this.isActive);
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
        return bindings.find(this.isActive);
    }

    private isActive(binding: Keybinding): boolean {
        const cmd = this.commandRegistry.getCommand(binding.commandId);
        if (cmd) {
            const handler = this.commandRegistry.getActiveHandler(cmd.id);
            // TODO? isActive()
            if (handler && (!handler.isVisible || handler.isVisible())) {
                return true;
            }
        }
        return false;
    }

}

export class KeyEventEmitter implements Disposable {

    private listener: EventListenerOrEventListenerObject;

    constructor(
        private commandRegistry: CommandRegistry,
        private keybindingRegistry: KeybindingRegistry) {

        this.listener = (event: any) => this.handleEvent(event);
        window.addEventListener('keydown', this.listener, false);
    }

    dispose() {
        window.removeEventListener('keydown', this.listener);
    }

    private handleEvent(event: KeyboardEvent): void {
        if (!event.defaultPrevented) {
            this.handleKey(KeyCode.createKeyCode(event), event);
        }
    }

    private handleKey(keyCode: KeyCode, event: KeyboardEvent): boolean {
        const binding = this.keybindingRegistry.getKeybindingForKeyCode(keyCode);
        if (binding) {
            const context = binding.context || KeybindingContexts.NOOP_CONTEXT;
            if (context && context.isEnabled(binding)) {
                const handler = this.commandRegistry.getActiveHandler(binding.commandId);
                if (handler) {
                    event.preventDefault();
                    handler.execute();
                    return true;
                }
            }
        }
        return false;
    }

}
