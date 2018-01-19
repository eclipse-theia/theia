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

export enum KeybindingScope {
    DEFAULT,
    USER,
    WORKSPACE,
    END
}

export namespace Keybinding {

    /**
     * Returns with the string representation of the binding. Any additional properties which are not described on the `Keybinding` API will be ignored.
     *
     * @param binding the binding to stringify.
     */
    export function stringify(binding: Keybinding): string {
        const copy: Keybinding = {
            commandId: binding.commandId,
            keyCode: binding.keyCode,
            contextId: binding.contextId,
            accelerator: binding.accelerator
        };
        return JSON.stringify(copy);
    }
}

export interface RawKeybinding {
    command: string;
    keybinding: string;
    context?: string;
    accelerator?: Accelerator;
}
export namespace RawKeybinding {
    export function isRawKeybinding(keybinding: RawKeybinding | Keybinding): keybinding is RawKeybinding {
        return (<RawKeybinding>keybinding).command !== undefined &&
            (<RawKeybinding>keybinding).keybinding !== undefined;
    }
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

    private keymaps: Keybinding[][] = [];
    static readonly PASSTHROUGH_PSEUDO_COMMAND = "passthrough";

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(KeybindingContextRegistry) protected readonly contextRegistry: KeybindingContextRegistry,
        @inject(ContributionProvider) @named(KeybindingContribution)
        protected readonly contributions: ContributionProvider<KeybindingContribution>,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        for (let i = KeybindingScope.DEFAULT; i < KeybindingScope.END; i++) { this.keymaps.push([]); }
    }

    onStart(): void {
        for (const contribution of this.contributions.getContributions()) {
            contribution.registerKeybindings(this);
        }
    }

    registerKeybindings(...bindings: (RawKeybinding | Keybinding)[]): void {
        for (const binding of bindings) {
            this.registerKeybinding(binding);
        }
    }

    protected keybindingFromRaw(binding: RawKeybinding): Keybinding {
        if (this.commandRegistry.getCommand(binding.command)) {
            try {
                const code = KeyCode.parse(binding.keybinding);
                let context: KeybindingContext | undefined;
                if (binding.context) {
                    context = this.contextRegistry.getContext(binding.context);
                }
                return {
                    commandId: binding.command,
                    keyCode: code,
                    contextId: context ? context.id : undefined,
                    accelerator: binding.accelerator
                };
            } catch {
                this.logger.error(`Can't parse keybinding ${JSON.stringify(binding)}`);
            }
        }
        throw (new Error("No command for that binding"));
    }

    /**
     * Register a default keybinding to the registry.
     *
     * @param binding
     */
    registerKeybinding(inputBinding: Keybinding | RawKeybinding) {

        let binding: Keybinding;
        if (RawKeybinding.isRawKeybinding(inputBinding)) {
            try {
                binding = this.keybindingFromRaw(inputBinding);
            } catch (error) {
                return;
            }
        } else {
            binding = inputBinding;
        }

        const existingBindings = this.getKeybindingsForKeyCode(binding.keyCode);
        if (existingBindings.length > 0) {
            const collided = existingBindings.filter(b => b.contextId === binding.contextId);
            if (collided.length > 0) {
                this.logger.warn('Collided keybinding is ignored; ', Keybinding.stringify(binding), ' collided with ', collided.map(b => Keybinding.stringify(b)).join(', '));
                return;
            }
        }
        this.keymaps[KeybindingScope.DEFAULT].push(binding);

    }

    /**
     * Get the keybindings associated to commandId.
     *
     * @param commandId The ID of the command for which we are looking for keybindings.
     */
    getKeybindingsForCommand(commandId: string): Keybinding[] {
        const result: Keybinding[] = [];

        for (let scope = KeybindingScope.END - 1; scope >= KeybindingScope.DEFAULT; scope--) {
            this.keymaps[scope].forEach(binding => {
                if (binding.commandId === commandId) {
                    result.push(binding);
                }
            });

            if (result.length > 0) {
                return result;
            }
        }
        return result;
    }

    /**
     * Get the list of keybindings matching keyCode.  The list is sorted by
     * priority (see #sortKeybindingsByPriority).
     *
     * @param keyCode The key code for which we are looking for keybindings.
     */
    getKeybindingsForKeyCode(keyCode: KeyCode): Keybinding[] {
        const result: Keybinding[] = [];

        for (let scope = KeybindingScope.DEFAULT; scope < KeybindingScope.END; scope++) {
            this.keymaps[scope].forEach(binding => {
                if (KeyCode.equals(binding.keyCode, keyCode)) {
                    if (!this.isKeybindingShadowed(scope, binding)) {
                        result.push(binding);
                    }
                }
            });
        }
        this.sortKeybindingsByPriority(result);
        return result;
    }

    /**
     * Returns a list of keybindings for a command in a specific scope
     * @param scope specific scope to look for
     * @param commandId unique id of the command
     */
    getScopedKeybindingsForCommand(scope: KeybindingScope, commandId: string): Keybinding[] {
        const result: Keybinding[] = [];

        if (scope >= KeybindingScope.END) {
            return [];
        }

        this.keymaps[scope].forEach(binding => {
            if (binding.commandId === commandId) {
                result.push(binding);
            }
        });
        return result;
    }

    /**
     * Returns true if a keybinding is shadowed in a more specific scope i.e bound in user scope but remapped in
     * workspace scope means the user keybinding is shadowed.
     * @param scope scope of the current keybinding
     * @param binding keybinding that will be checked in more specific scopes
     */
    isKeybindingShadowed(scope: KeybindingScope, binding: Keybinding): boolean {
        if (scope >= KeybindingScope.END) {
            return false;
        }

        const nextScope = ++scope;

        if (this.getScopedKeybindingsForCommand(nextScope, binding.commandId).length > 0) {
            return true;
        }
        return this.isKeybindingShadowed(nextScope, binding);
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

    setKeymap(scope: KeybindingScope, rawKeyBindings: RawKeybinding[]) {
        const customBindings: Keybinding[] = [];
        for (const rawKeyBinding of rawKeyBindings) {
            if (this.commandRegistry.getCommand(rawKeyBinding.command)) {
                try {
                    const code = KeyCode.parse(rawKeyBinding.keybinding);

                    let context: KeybindingContext | undefined;
                    if (rawKeyBinding.context) {
                        context = this.contextRegistry.getContext(rawKeyBinding.context);
                    }

                    customBindings.push({
                        commandId: rawKeyBinding.command,
                        keyCode: code,
                        contextId: context ? context.id : undefined
                    });
                } catch (error) {
                    this.logger.warn(`Invalid keybinding, keymap reset`);
                    this.resetKeybindingsForScope(scope);
                    return;
                }
            } else {
                this.logger.warn(`Invalid command id:  ${rawKeyBinding.command} does not exist, no command will be bound to keybinding: ${rawKeyBinding.keybinding}`);
                return;
            }
        }
        this.keymaps[scope] = customBindings;
    }

    /**
     * Reset keybindings for a specific scope
     * @param scope scope to reset the keybindings for
     */
    resetKeybindingsForScope(scope: KeybindingScope) {
        this.keymaps[scope] = [];
    }

    /**
     * Reset keybindings for all scopes(only leaves the default keybindings mapped)
     */
    resetKeybindings() {
        for (let i = KeybindingScope.DEFAULT + 1; i < KeybindingScope.END; i++) {
            this.keymaps[i] = [];
        }
    }
}
