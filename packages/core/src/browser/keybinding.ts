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
import { isOSX } from '../common/os';
import { Emitter, Event } from '../common/event';
import { CommandRegistry } from '../common/command';
import { Disposable, DisposableCollection } from '../common/disposable';
import { KeyCode, KeySequence, Key } from './keyboard/keys';
import { KeyboardLayoutService } from './keyboard/keyboard-layout-service';
import { ContributionProvider } from '../common/contribution-provider';
import { ILogger } from '../common/logger';
import { StatusBarAlignment, StatusBar } from './status-bar/status-bar';
import { ContextKeyService } from './context-key-service';
import * as common from '../common/keybinding';

export enum KeybindingScope {
    DEFAULT,
    DEFAULT_OVERRIDING,
    USER,
    WORKSPACE,
    END
}
export namespace KeybindingScope {
    export const length = KeybindingScope.END - KeybindingScope.DEFAULT;
}

/**
 * @deprecated import from `@theia/core/lib/common/keybinding` instead
 */
export type Keybinding = common.Keybinding;
export const Keybinding = common.Keybinding;

export interface ResolvedKeybinding extends Keybinding {
    /**
     * The KeyboardLayoutService may transform the `keybinding` depending on the
     * user's keyboard layout. This property holds the transformed keybinding that
     * should be used in the UI. The value is undefined if the KeyboardLayoutService
     * has not been called yet to resolve the keybinding.
     */
    resolved?: KeyCode[];
}

export interface ScopedKeybinding extends Keybinding {
    /** Current keybinding scope */
    scope?: KeybindingScope;
}

export const KeybindingContribution = Symbol('KeybindingContribution');
/**
 * Representation of a keybinding contribution.
 */
export interface KeybindingContribution {
    /**
     * Registers keybindings.
     * @param keybindings the keybinding registry.
     */
    registerKeybindings(keybindings: KeybindingRegistry): void;
}

export const KeybindingContext = Symbol('KeybindingContext');
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

/**
 * Keybinding context that is enabled when the focused HTML element is an `input` or a `textArea`.
 */
@injectable()
export class NativeTextInputFocusContext implements KeybindingContext {

    static readonly ID = 'nativeTextInputFocus';
    readonly id = NativeTextInputFocusContext.ID;

    /**
     * `true` if the "focused" DOM element (`document.activeElement`) is an `input` or a `textArea`. Otherwise, `false`.
     */
    isEnabled(): boolean {
        const { activeElement } = document;
        return !!activeElement && ['input', 'textarea'].indexOf(activeElement.tagName.toLocaleLowerCase()) !== -1;
    }

}

@injectable()
export class KeybindingRegistry {

    static readonly PASSTHROUGH_PSEUDO_COMMAND = 'passthrough';
    protected keySequence: KeySequence = [];

    protected readonly contexts: { [id: string]: KeybindingContext } = {};
    protected readonly keymaps: Keybinding[][] = [...Array(KeybindingScope.length)].map(() => []);

    @inject(KeyboardLayoutService)
    protected readonly keyboardLayoutService: KeyboardLayoutService;

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

    @inject(ContextKeyService)
    protected readonly whenContextService: ContextKeyService;

    async onStart(): Promise<void> {
        await this.keyboardLayoutService.initialize();
        this.keyboardLayoutService.onKeyboardLayoutChanged(newLayout => {
            this.clearResolvedKeybindings();
            this.keybindingsChanged.fire(undefined);
        });
        this.registerContext(KeybindingContexts.NOOP_CONTEXT);
        this.registerContext(KeybindingContexts.DEFAULT_CONTEXT);
        this.registerContext(...this.contextProvider.getContributions());
        for (const contribution of this.contributions.getContributions()) {
            contribution.registerKeybindings(this);
        }
    }

    protected keybindingsChanged = new Emitter<void>();

    /**
     * Event that is fired when the resolved keybindings change due to a different keyboard layout
     * or when a new keymap is being set
     */
    get onKeybindingsChanged(): Event<void> {
        return this.keybindingsChanged.event;
    }

    /**
     * Registers the keybinding context arguments into the application. Fails when an already registered
     * context is being registered.
     *
     * @param contexts the keybinding contexts to register into the application.
     */
    protected registerContext(...contexts: KeybindingContext[]): void {
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
     * @param override Override existed keybinding
     */
    registerKeybinding(binding: Keybinding, override?: boolean): Disposable {
        return this.doRegisterKeybinding(binding, !!override ? KeybindingScope.DEFAULT_OVERRIDING : undefined);
    }

    /**
     * Register default keybindings to the registry
     *
     * @param bindings
     */
    registerKeybindings(...bindings: Keybinding[]): Disposable {
        return this.doRegisterKeybindings(bindings, KeybindingScope.DEFAULT);
    }

    /**
     * Unregister keybinding from the registry
     *
     * @param binding
     */
    unregisterKeybinding(binding: Keybinding): void;
    /**
     * Unregister keybinding from the registry
     *
     * @param key
     */
    unregisterKeybinding(key: string): void;
    unregisterKeybinding(keyOrBinding: Keybinding | string): void {
        const key = Keybinding.is(keyOrBinding) ? keyOrBinding.keybinding : keyOrBinding;
        const keymap = this.keymaps[KeybindingScope.DEFAULT];
        const bindings = keymap.filter(el => el.keybinding === key);

        bindings.forEach(binding => {
            const idx = keymap.indexOf(binding);
            if (idx >= 0) {
                keymap.splice(idx, 1);
            }
        });
    }

    protected doRegisterKeybindings(bindings: Keybinding[], scope: KeybindingScope = KeybindingScope.DEFAULT): Disposable {
        const toDispose = new DisposableCollection();
        for (const binding of bindings) {
            toDispose.push(this.doRegisterKeybinding(binding, scope));
        }
        return toDispose;
    }

    protected doRegisterKeybinding(binding: Keybinding, scope: KeybindingScope = KeybindingScope.DEFAULT): Disposable {
        try {
            this.resolveKeybinding(binding);
            if (this.containsKeybinding(this.keymaps[scope], binding) && scope !== KeybindingScope.DEFAULT_OVERRIDING) {
                throw new Error(`"${binding.keybinding}" is in collision with something else [scope:${scope}]`);
            }
            this.keymaps[scope].push(binding);
            return Disposable.create(() => {
                const index = this.keymaps[scope].indexOf(binding);
                if (index !== -1) {
                    this.keymaps[scope].splice(index, 1);
                }
            });
        } catch (error) {
            this.logger.warn(`Could not register keybinding:\n  ${Keybinding.stringify(binding)}\n${error}`);
            return Disposable.NULL;
        }
    }

    /**
     * Ensure that the `resolved` property of the given binding is set by calling the KeyboardLayoutService.
     */
    resolveKeybinding(binding: ResolvedKeybinding): KeyCode[] {
        if (!binding.resolved) {
            const sequence = KeySequence.parse(binding.keybinding);
            binding.resolved = sequence.map(code => this.keyboardLayoutService.resolveKeyCode(code));
        }
        return binding.resolved;
    }

    /**
     * Clear all `resolved` properties of registered keybindings so the KeyboardLayoutService is called
     * again to resolve them. This is necessary when the user's keyboard layout has changed.
     */
    protected clearResolvedKeybindings(): void {
        for (let i = KeybindingScope.DEFAULT; i < KeybindingScope.END; i++) {
            const bindings = this.keymaps[i];
            for (let j = 0; j < bindings.length; j++) {
                const binding = bindings[j] as ResolvedKeybinding;
                binding.resolved = undefined;
            }
        }
    }

    /**
     * Checks for keySequence collisions in a list of Keybindings
     *
     * @param bindings the keybinding reference list
     * @param binding the keybinding to test collisions for
     */
    containsKeybinding(bindings: Keybinding[], binding: Keybinding): boolean {
        const bindingKeySequence = this.resolveKeybinding(binding);
        const collisions = this.getKeySequenceCollisions(bindings, bindingKeySequence)
            .filter(b => b.context === binding.context && !b.when && !binding.when);

        if (collisions.full.length > 0) {
            this.logger.warn('Collided keybinding is ignored; ',
                Keybinding.stringify(binding), ' collided with ',
                collisions.full.map(b => Keybinding.stringify(b)).join(', '));
            return true;
        }
        if (collisions.partial.length > 0) {
            this.logger.warn('Shadowing keybinding is ignored; ',
                Keybinding.stringify(binding), ' shadows ',
                collisions.partial.map(b => Keybinding.stringify(b)).join(', '));
            return true;
        }
        if (collisions.shadow.length > 0) {
            this.logger.warn('Shadowed keybinding is ignored; ',
                Keybinding.stringify(binding), ' would be shadowed by ',
                collisions.shadow.map(b => Keybinding.stringify(b)).join(', '));
            return true;
        }
        return false;
    }

    containsKeybindingInScope(binding: Keybinding, scope = KeybindingScope.USER): boolean {
        return this.containsKeybinding(this.keymaps[scope], binding);
    }

    /**
     * Return a user visible representation of a keybinding.
     */
    acceleratorFor(keybinding: Keybinding, separator: string = ' '): string[] {
        const bindingKeySequence = this.resolveKeybinding(keybinding);
        return this.acceleratorForSequence(bindingKeySequence, separator);
    }

    /**
     * Return a user visible representation of a key sequence.
     */
    acceleratorForSequence(keySequence: KeySequence, separator: string = ' '): string[] {
        return keySequence.map(keyCode => this.acceleratorForKeyCode(keyCode, separator));
    }

    /**
     * Return a user visible representation of a key code (a key with modifiers).
     */
    acceleratorForKeyCode(keyCode: KeyCode, separator: string = ' '): string {
        const keyCodeResult = [];
        if (keyCode.meta && isOSX) {
            keyCodeResult.push('Cmd');
        }
        if (keyCode.ctrl) {
            keyCodeResult.push('Ctrl');
        }
        if (keyCode.alt) {
            keyCodeResult.push('Alt');
        }
        if (keyCode.shift) {
            keyCodeResult.push('Shift');
        }
        if (keyCode.key) {
            keyCodeResult.push(this.acceleratorForKey(keyCode.key));
        }
        return keyCodeResult.join(separator);
    }

    /**
     * Return a user visible representation of a single key.
     */
    acceleratorForKey(key: Key): string {
        if (isOSX) {
            if (key === Key.ARROW_LEFT) {
                return '←';
            }
            if (key === Key.ARROW_RIGHT) {
                return '→';
            }
            if (key === Key.ARROW_UP) {
                return '↑';
            }
            if (key === Key.ARROW_DOWN) {
                return '↓';
            }
        }
        const keyString = this.keyboardLayoutService.getKeyboardCharacter(key);
        if (key.keyCode >= Key.KEY_A.keyCode && key.keyCode <= Key.KEY_Z.keyCode ||
            key.keyCode >= Key.F1.keyCode && key.keyCode <= Key.F24.keyCode) {
            return keyString.toUpperCase();
        } else if (keyString.length > 1) {
            return keyString.charAt(0).toUpperCase() + keyString.slice(1);
        } else {
            return keyString;
        }
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
            const bindingKeySequence = this.resolveKeybinding(binding);
            result.merge(this.getKeySequenceCollisions(bindings, bindingKeySequence));
        } catch (error) {
            this.logger.warn(error);
        }
        return result;
    }

    /**
     * Finds collisions for a key sequence inside a list of bindings (error-free)
     *
     * @param bindings the reference bindings
     * @param candidate the sequence to match
     */
    protected getKeySequenceCollisions(bindings: Keybinding[], candidate: KeySequence): KeybindingRegistry.KeybindingsResult {
        const result = new KeybindingRegistry.KeybindingsResult();
        for (const binding of bindings) {
            try {
                const bindingKeySequence = this.resolveKeybinding(binding);
                const compareResult = KeySequence.compare(candidate, bindingKeySequence);
                switch (compareResult) {
                    case KeySequence.CompareResult.FULL: {
                        result.full.push(binding);
                        break;
                    }
                    case KeySequence.CompareResult.PARTIAL: {
                        result.partial.push(binding);
                        break;
                    }
                    case KeySequence.CompareResult.SHADOW: {
                        result.shadow.push(binding);
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
     * @param event The source keyboard event.
     */
    getKeybindingsForKeySequence(keySequence: KeySequence, event?: KeyboardEvent): KeybindingRegistry.KeybindingsResult {
        const result = new KeybindingRegistry.KeybindingsResult();

        for (let scope = KeybindingScope.END; --scope >= KeybindingScope.DEFAULT;) {
            const matches = this.getKeySequenceCollisions(this.keymaps[scope], keySequence);

            matches.full = matches.full.filter(
                binding => (!event || this.isEnabled(binding, event)) && this.getKeybindingCollisions(result.full, binding).full.length === 0);
            matches.partial = matches.partial.filter(
                binding => (!event || this.isEnabled(binding, event)) && this.getKeybindingCollisions(result.partial, binding).partial.length === 0);

            if (scope === KeybindingScope.DEFAULT_OVERRIDING) {
                matches.full.reverse();
                matches.partial.reverse();
            }
            matches.full.forEach(binding => binding.scope = scope);
            matches.partial.forEach(binding => binding.scope = scope);
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
    getKeybindingsForCommand(commandId: string): ScopedKeybinding[] {
        const result: ScopedKeybinding[] = [];

        for (let scope = KeybindingScope.END - 1; scope >= KeybindingScope.DEFAULT; scope--) {
            this.keymaps[scope].forEach(binding => {
                const command = this.commandRegistry.getCommand(binding.command);
                if (command) {
                    if (command.id === commandId) {
                        result.push({ ...binding, scope });
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
    private sortKeybindingsByPriority(keybindings: Keybinding[]): void {
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
     * @param binding to execute
     * @param event keyboard event.
     */
    protected executeKeyBinding(binding: Keybinding, event: KeyboardEvent): void {
        if (this.isPseudoCommand(binding.command)) {
            /* Don't do anything, let the event propagate.  */
        } else {
            const command = this.commandRegistry.getCommand(binding.command);
            if (command) {
                this.commandRegistry.executeCommand(binding.command, binding.args)
                    .catch(e => console.error('Failed to execute command:', e));

                /* Note that if a keybinding is in context but the command is
                   not active we still stop the processing here.  */
                event.preventDefault();
                event.stopPropagation();
            }
        }
    }

    /**
     * Only execute if it has no context (global context) or if we're in that context.
     */
    protected isEnabled(binding: Keybinding, event: KeyboardEvent): boolean {
        const context = binding.context && this.contexts[binding.context];
        if (context && !context.isEnabled(binding)) {
            return false;
        }
        if (binding.when && !this.whenContextService.match(binding.when, <HTMLElement>event.target)) {
            return false;
        }
        return true;
    }

    dispatchKeyDown(input: KeyboardEventInit | KeyCode | string, target: EventTarget = document.activeElement || window): void {
        const eventInit = this.asKeyboardEventInit(input);
        const emulatedKeyboardEvent = new KeyboardEvent('keydown', eventInit);
        target.dispatchEvent(emulatedKeyboardEvent);
    }
    protected asKeyboardEventInit(input: KeyboardEventInit | KeyCode | string): KeyboardEventInit & Partial<{ keyCode: number }> {
        if (typeof input === 'string') {
            return this.asKeyboardEventInit(KeyCode.createKeyCode(input));
        }
        if (input instanceof KeyCode) {
            return {
                metaKey: input.meta,
                shiftKey: input.shift,
                altKey: input.alt,
                ctrlKey: input.ctrl,
                code: input.key && input.key.code,
                key: (input && input.character) || (input.key && input.key.code),
                keyCode: input.key && input.key.keyCode
            };
        }
        return input;
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

        this.keyboardLayoutService.validateKeyCode(keyCode);
        this.keySequence.push(keyCode);
        const bindings = this.getKeybindingsForKeySequence(this.keySequence, event);
        const full = bindings.full.find(binding => this.isEnabled(binding, event));
        const partial = bindings.partial.find(binding => (!full || binding.scope! > full.scope!) && this.isEnabled(binding, event));
        if (partial) {
            /* Accumulate the keysequence */
            event.preventDefault();
            event.stopPropagation();

            this.statusBar.setElement('keybinding-status', {
                text: `(${this.acceleratorForSequence(this.keySequence, '+')}) was pressed, waiting for more keys`,
                alignment: StatusBarAlignment.LEFT,
                priority: 2
            });
        } else {
            if (full) {
                this.executeKeyBinding(full, event);
            }
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

    setKeymap(scope: KeybindingScope, bindings: Keybinding[]): void {
        this.resetKeybindingsForScope(scope);
        this.toResetKeymap.set(scope, this.doRegisterKeybindings(bindings, scope));
        this.keybindingsChanged.fire(undefined);
    }

    protected readonly toResetKeymap = new Map<KeybindingScope, Disposable>();

    /**
     * Reset keybindings for a specific scope
     * @param scope scope to reset the keybindings for
     */
    resetKeybindingsForScope(scope: KeybindingScope): void {
        const toReset = this.toResetKeymap.get(scope);
        if (toReset) {
            toReset.dispose();
        }
    }

    /**
     * Reset keybindings for all scopes(only leaves the default keybindings mapped)
     */
    resetKeybindings(): void {
        for (let i = KeybindingScope.DEFAULT + 1; i < KeybindingScope.END; i++) {
            this.keymaps[i] = [];
        }
    }
}

export namespace KeybindingRegistry {
    export class KeybindingsResult {
        full: ScopedKeybinding[] = [];
        partial: ScopedKeybinding[] = [];
        shadow: ScopedKeybinding[] = [];

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
