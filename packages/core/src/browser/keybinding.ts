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
import { CommandRegistry } from '../common/command';
import { KeyCode, KeySequence } from './keys';
import { ContributionProvider } from '../common/contribution-provider';
import { ILogger } from "../common/logger";
import { StatusBarAlignment, StatusBar } from './status-bar/status-bar';
import { isOSX } from '../common/os';

export enum KeybindingScope {
    DEFAULT,
    USER,
    WORKSPACE,
    END
}
export namespace KeybindingScope {
    export const length = KeybindingScope.END - KeybindingScope.DEFAULT;
}

export namespace Keybinding {

    /**
     * Returns with the string representation of the binding.
     * Any additional properties which are not described on
     * the `Keybinding` API will be ignored.
     *
     * @param binding the binding to stringify.
     */
    export function stringify(binding: Keybinding): string {
        const copy: Keybinding = {
            command: binding.command,
            keybinding: binding.keybinding,
            context: binding.context
        };
        return JSON.stringify(copy);
    }

    /* Return a user visible representation of a keybinding.  */
    export function acceleratorFor(keybinding: Keybinding, separator: string = " ") {
        const keyCodesString = keybinding.keybinding.split(" ");
        return KeySequence.acceleratorFor(keyCodesString.map(k => KeyCode.parse(k)), separator);
    }
}

export interface Keybinding {
    /* Command identifier, this needs to be a unique string.  */
    command: string;
    /* Keybinding string as defined in packages/keymaps/README.md.  */
    keybinding: string;
    /**
     * The optional keybinding context where this binding belongs to.
     * If not specified, then this keybinding context belongs to the NOOP
     * keybinding context.
     */
    context?: string;
}

export const KeybindingContribution = Symbol("KeybindingContribution");
export interface KeybindingContribution {
    registerKeybindings(keybindings: KeybindingRegistry): void;
}

export const KeybindingContext = Symbol("KeybindingContext");
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
export class KeybindingRegistry {

    static readonly PASSTHROUGH_PSEUDO_COMMAND = "passthrough";
    protected keySequence: KeySequence = [];

    protected readonly contexts: { [id: string]: KeybindingContext } = {};
    protected readonly keymaps: Keybinding[][] = [...Array(KeybindingScope.length)].map(() => []);

    @inject(ContributionProvider) @named(KeybindingContext)
    protected readonly contextProvider: ContributionProvider<KeybindingContext>;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(ContributionProvider) @named(KeybindingContribution)
    protected readonly contributions: ContributionProvider<KeybindingContribution>;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(ILogger)
    protected readonly logger: ILogger;

    onStart(): void {
        this.registerContext(KeybindingContexts.NOOP_CONTEXT);
        this.registerContext(KeybindingContexts.DEFAULT_CONTEXT);
        this.registerContext(...this.contextProvider.getContributions());
        for (const contribution of this.contributions.getContributions()) {
            contribution.registerKeybindings(this);
        }
    }

    /**
     * Registers the keybinding context arguments into the application. Fails when an already registered
     * context is being registered.
     *
     * @param contexts the keybinding contexts to register into the application.
     */
    protected registerContext(...contexts: KeybindingContext[]) {
        for (const context of contexts) {
            const { id } = context;
            if (this.contexts[id]) {
                this.logger.error(`A keybinding context with ID ${id} is already registered.`);
            } else {
                this.contexts[id] = context;
            }
        }
    }

    /**
     * Register a default keybinding to the registry.
     *
     * @param binding
     */
    registerKeybinding(binding: Keybinding) {
        this.doRegisterKeybinding(binding, KeybindingScope.DEFAULT);
    }

    /**
     * Register default keybindings to the registry
     *
     * @param bindings
     */
    registerKeybindings(...bindings: Keybinding[]): void {
        this.doRegisterKeybindings(bindings, KeybindingScope.DEFAULT);
    }

    protected doRegisterKeybindings(bindings: Keybinding[], scope: KeybindingScope = KeybindingScope.DEFAULT) {
        for (const binding of bindings) {
            this.doRegisterKeybinding(binding, scope);
        }
    }

    protected doRegisterKeybinding(binding: Keybinding, scope: KeybindingScope = KeybindingScope.DEFAULT) {
        try {
            if (!this.containsKeybinding(this.keymaps[scope], binding)) {
                throw new Error(`"${binding.keybinding}" is in collision with something else [scope:${scope}]`);
            }
            this.keymaps[scope].push(binding);
        } catch (error) {
            this.logger.warn(`Could not register keybinding:\n  ${Keybinding.stringify(binding)}\n${error}`);
        }
    }

    /**
     * Checks for keySequence collisions in a list of Keybindings
     *
     * @param bindings the keybinding reference list
     * @param binding the keybinding to test collisions for
     */
    containsKeybinding(bindings: Keybinding[], binding: Keybinding): boolean {
        const collisions = this.getKeySequenceCollisions(bindings, KeySequence.parse(
            this.getCurrentPlatformKeybinding(binding.keybinding))
        ).filter(b => b.context === binding.context);

        if (collisions.full.length > 0) {
            this.logger.warn('Collided keybinding is ignored; ',
                Keybinding.stringify(binding), ' collided with ',
                collisions.full.map(b => Keybinding.stringify(b)).join(', '));
            return false;
        }
        if (collisions.partial.length > 0) {
            this.logger.warn('Shadowing keybinding is ignored; ',
                Keybinding.stringify(binding), ' shadows ',
                collisions.partial.map(b => Keybinding.stringify(b)).join(', '));
            return false;
        }
        if (collisions.shadow.length > 0) {
            this.logger.warn('Shadowed keybinding is ignored; ',
                Keybinding.stringify(binding), ' would be shadowed by ',
                collisions.shadow.map(b => Keybinding.stringify(b)).join(', '));
            return false;
        }
        return true;
    }

    /**
     * Converts special `ctrlcmd` modifier back to `ctrl` for non-OSX users in a keybinding string.
     * (`ctrlcmd` is mapped to the same actual key as `ctrl` under non-OSX users)
     *
     * @param keybinding The keybinding string to convert.
     */
    protected getCurrentPlatformKeybinding(keybinding: string): string {
        return isOSX ? keybinding : keybinding.replace(/\bctrlcmd\b/, 'ctrl');
    }

    /**
     * Finds collisions for a binding inside a list of bindings (error-free)
     *
     * @param bindings the reference bindings
     * @param binding the binding to match
     */
    protected getKeybindingCollisions(bindings: Keybinding[], binding: Keybinding): KeybindingRegistry.KeybindingsResult {
        const result = new KeybindingRegistry.KeybindingsResult();
        try {
            const keySequence = KeySequence.parse(this.getCurrentPlatformKeybinding(binding.keybinding));
            result.merge(this.getKeySequenceCollisions(bindings, keySequence));
        } catch (error) {
            this.logger.warn(error);
        }
        return result;
    }

    /**
     * Finds collisions for a key sequence inside a list of bindings (error-free)
     *
     * @param bindings the reference bindings
     * @param keySequence the sequence to match
     */
    protected getKeySequenceCollisions(bindings: Keybinding[], keySequence: KeyCode[]): KeybindingRegistry.KeybindingsResult {
        const result = new KeybindingRegistry.KeybindingsResult();

        for (const registeredBinding of bindings) {
            try {
                const bindingKeySequence = KeySequence.parse(registeredBinding.keybinding);
                const compareResult = KeySequence.compare(keySequence, bindingKeySequence);
                switch (compareResult) {
                    case KeySequence.CompareResult.FULL: {
                        result.full.push(registeredBinding);
                        break;
                    }
                    case KeySequence.CompareResult.PARTIAL: {
                        result.partial.push(registeredBinding);
                        break;
                    }
                    case KeySequence.CompareResult.SHADOW: {
                        result.shadow.push(registeredBinding);
                        break;
                    }
                    default: {
                        break;
                    }
                }
            } catch (error) {
                this.logger.warn(error);
            }
        }
        return result;
    }

    /**
     * Get the lists of keybindings matching fully or partially matching a KeySequence.
     * The lists are sorted by priority (see #sortKeybindingsByPriority).
     *
     * @param keySequence The key sequence for which we are looking for keybindings.
     */
    getKeybindingsForKeySequence(keySequence: KeySequence): KeybindingRegistry.KeybindingsResult {
        const result = new KeybindingRegistry.KeybindingsResult();

        for (let scope = KeybindingScope.END; --scope >= KeybindingScope.DEFAULT;) {
            const matches = this.getKeySequenceCollisions(this.keymaps[scope], keySequence);

            matches.full = matches.full.filter(
                binding => this.getKeybindingCollisions(result.full, binding).full.length === 0);
            matches.partial = matches.partial.filter(
                binding => this.getKeybindingCollisions(result.partial, binding).partial.length === 0);

            result.merge(matches);
        }
        this.sortKeybindingsByPriority(result.full);
        this.sortKeybindingsByPriority(result.partial);
        return result;
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
                const command = this.commandRegistry.getCommand(binding.command);
                if (command) {
                    if (command.id === commandId) {
                        result.push(binding);
                    }
                }
            });

            if (result.length > 0) {
                return result;
            }
        }
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
            const command = this.commandRegistry.getCommand(binding.command);
            if (command && command.id === commandId) {
                result.push(binding);
            }
        });
        return result;
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

            let acontext: KeybindingContext | undefined;
            if (a.context) {
                acontext = this.contexts[a.context];
            }

            let bcontext: KeybindingContext | undefined;
            if (b.context) {
                bcontext = this.contexts[b.context];
            }

            if (acontext && !bcontext) {
                return -1;
            }

            if (!acontext && bcontext) {
                return 1;
            }

            return 0;
        });
    }

    protected isActive(binding: Keybinding): boolean {
        /* Pseudo commands like "passthrough" are always active (and not found
           in the command registry).  */
        if (this.isPseudoCommand(binding.command)) {
            return true;
        }

        const command = this.commandRegistry.getCommand(binding.command);
        return !!command && !!this.commandRegistry.getActiveHandler(command.id);
    }

    /**
     * Tries to execute a keybinding.
     *
     * @param bindings list of matching keybindings as returned by getKeybindingsForKeySequence.full
     * @param event keyboard event.
     * @return true if the corresponding command was executed false otherwise.
     */
    protected tryKeybindingExecution(bindings: Keybinding[], event: KeyboardEvent) {

        if (bindings.length === 0) {
            return false;
        }

        for (const binding of bindings) {
            const context = binding.context !== undefined && this.contexts[binding.context];

            /* Only execute if it has no context (global context) or if we're in
               that context.  */
            if (!context || context.isEnabled(binding)) {

                if (this.isPseudoCommand(binding.command)) {
                    /* Don't do anything, let the event propagate.  */
                    return true;
                } else {
                    const command = this.commandRegistry.getCommand(binding.command);
                    if (command) {
                        const commandHandler = this.commandRegistry.getActiveHandler(command.id);

                        if (commandHandler) {
                            commandHandler.execute();
                        }

                        /* Note that if a keybinding is in context but the command is
                           not active we still stop the processing here.  */
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                }
                return false;
            }
        }
        return false;
    }

    /**
     * Run the command matching to the given keyboard event.
     */
    run(event: KeyboardEvent): void {
        if (event.defaultPrevented) {
            return;
        }

        const keyCode = KeyCode.createKeyCode(event);
        /* Keycode is only a modifier, next keycode will be modifier + key.
           Ignore this one.  */
        if (keyCode.isModifierOnly()) {
            return;
        }

        this.keySequence.push(keyCode);
        const bindings = this.getKeybindingsForKeySequence(this.keySequence);

        if (this.tryKeybindingExecution(bindings.full, event)) {

            this.keySequence = [];
            this.statusBar.removeElement('keybinding-status');

        } else if (bindings.partial.length > 0) {

            /* Accumulate the keysequence */
            event.preventDefault();
            event.stopPropagation();

            this.statusBar.setElement('keybinding-status', {
                text: `(${KeySequence.acceleratorFor(this.keySequence, "+")}) was pressed, waiting for more keys`,
                alignment: StatusBarAlignment.LEFT,
                priority: 2
            });

        } else {
            this.keySequence = [];
            this.statusBar.removeElement('keybinding-status');
        }
    }

    /**
     * Return true of string a pseudo-command id, in other words a command id
     * that has a special meaning and that we won't find in the command
     * registry.
     *
     * @param commandId commandId to test
     */
    isPseudoCommand(commandId: string): boolean {
        return commandId === KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND;
    }

    setKeymap(scope: KeybindingScope, bindings: Keybinding[]) {
        this.resetKeybindingsForScope(scope);
        this.doRegisterKeybindings(bindings, scope);
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

export namespace KeybindingRegistry {
    export class KeybindingsResult {
        full: Keybinding[] = [];
        partial: Keybinding[] = [];
        shadow: Keybinding[] = [];

        /**
         * Merge two results together inside `this`
         *
         * @param other the other KeybindingsResult to merge with
         * @return this
         */
        merge(other: KeybindingsResult): KeybindingsResult {
            this.full.push(...other.full);
            this.partial.push(...other.partial);
            this.shadow.push(...other.shadow);
            return this;
        }

        /**
         * Returns a new filtered KeybindingsResult
         *
         * @param fn callback filter on the results
         * @return filtered new result
         */
        filter(fn: (binding: Keybinding) => boolean): KeybindingsResult {
            const result = new KeybindingsResult();
            result.full = this.full.filter(fn);
            result.partial = this.partial.filter(fn);
            result.shadow = this.shadow.filter(fn);
            return result;
        }
    }
}
