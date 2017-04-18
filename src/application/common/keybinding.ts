import { Disposable } from './';
import { CommandRegistry, Enabled } from './command';
import { injectable, inject, multiInject } from 'inversify';

export declare type Accelerator = (keybinding: Keybinding) => string[];

export namespace Accelerator {
    export const NOOP: Accelerator = (keybinding) => [];
}

export interface Keybinding {
    readonly commandId: string;
    readonly keyCode: number;
    /**
     * The optional keybinding context ID of the context this binding belongs to.
     * If not specified, then this keybinding context belongs to the default
     * keybinding context.
     */
    readonly contextId?: string;
    readonly isEnabled?: Enabled;
    /**
     * Sugar for showing the keybindings in the menus.
     */
    readonly accelerator?: Accelerator;
};

export const KeybindingContribution = Symbol("KeybindingContribution");
export interface KeybindingContribution {
    getKeybindings(): Keybinding[];
}

export interface KeybindingContext {

    /**
     * The unique ID of the keybinding context.
     */
    readonly id: string,
    /**
     * Returns with the unique identifier of the parent context (if any).
     */
    readonly parentId?: string,
    /**
     * Returns with true if the keybinding argument is valid in this context.
     * Otherwise returns with false.
     */
    readonly enabled: (binding: Keybinding) => boolean;

}

export namespace KeybindingContext {

    /**
     * The keybinding context symbol for DI.
     */
    export const KeybindingContext = Symbol("KeybindingContext");

    /**
     * The default keybinding context.
     */
    export const DEFAULT_CONTEXT: KeybindingContext = {
        id: 'default.keybinding.context',
        enabled: (binding: Keybinding): boolean => true
    }
}

@injectable()
export class KeybindingContextRegistry {

    contexts: { [id: string]: KeybindingContext };
    contextHierarchy: { [id: string]: KeybindingContext };

    constructor( @multiInject(KeybindingContext.KeybindingContext) contexts: KeybindingContext[]) {
        this.contexts = {};
        this.contexts[KeybindingContext.DEFAULT_CONTEXT.id] = KeybindingContext.DEFAULT_CONTEXT;
        contexts.forEach(context => this.registerContext(context));
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
            this.alignContextHierarchies();
        }
    }

    getContext(contextId: string): KeybindingContext | undefined {
        return this.contexts[contextId];
    }

    private alignContextHierarchies() {
        this.contextHierarchy = {};
        Object.keys(this.contexts).forEach(id => {
            const { parentId } = this.contexts[id];
            if (parentId) {
                const parent = this.contexts[parentId];
                if (parent) {
                    this.contextHierarchy[id] = parent;
                }
            }
        })
    }

}


@injectable()
export class KeybindingRegistry {

    keybindings: { [index: number]: Keybinding[] }
    commands: { [commandId: string]: Keybinding[] }

    constructor(
        @inject(CommandRegistry) protected commandRegistry: CommandRegistry,
        @inject(KeybindingContextRegistry) protected contextRegistry: KeybindingContextRegistry,
        @multiInject(KeybindingContribution) protected contributions: KeybindingContribution[]) {

        this.keybindings = {};
        this.commands = {};
        for (let contribution of contributions) {
            for (let keyb of contribution.getKeybindings()) {
                this.registerKeyBinding(keyb);
            }
        }
        new KeyEventEmitter(commandRegistry, this, contextRegistry);
    }

    /**
     * Adds a keybinding to the registry.
     *
     * @param binding
     */
    registerKeyBinding(binding: Keybinding) {
        const { keyCode, commandId } = binding;
        const bindings = this.keybindings[keyCode] || [];
        bindings.push(binding);
        this.keybindings[keyCode] = bindings;
        const commands = this.commands[commandId] || [];
        commands.push(binding);
        this.commands[commandId] = bindings;
    }

    /**
     * @param keyCode the keycode for which to look up a Keybinding
     */
    getKeybinding(keyCodeOrCommandId: number | string): Keybinding | undefined {
        const bindings = this.getBindings(keyCodeOrCommandId);
        if (bindings) {
            for (const binding of bindings) {
                if (this.isValid(binding)) {
                    return binding;
                }
            }
        }
        return undefined;
    }

    // TODO get the command for a keybinding.

    private isValid(binding: Keybinding): boolean {
        let cmd = this.commandRegistry.getCommand(binding.commandId);
        if (cmd) {
            let handler = this.commandRegistry.getActiveHandler(cmd.id);
            // TODO isActive()
            if (handler && (!handler.isVisible || handler.isVisible())) {
                return true;
            }
        }
        return false;
    }

    private getBindings(keyCodeOrCommandId: number | string): Keybinding[] {
        if (typeof keyCodeOrCommandId === 'string') {
            return this.commands[keyCodeOrCommandId];
        } else {
            return this.keybindings[keyCodeOrCommandId];
        }
    }
}

class KeyEventEmitter implements Disposable {

    private listener: EventListenerOrEventListenerObject;

    constructor(
        private commandRegistry: CommandRegistry,
        private keybindingRegistry: KeybindingRegistry,
        private keybindingContextRegistry: KeybindingContextRegistry) {

        ((): void => {
            this.listener = (e: KeyboardEvent) => this.handleEvent(e);
            window.addEventListener('keyup', this.listener);
        })();
    }

    dispose() {
        if (this.listener) {
            window.removeEventListener('keyup', this.listener);
        }
    }

    private handleEvent(e: KeyboardEvent): void {
        let { keyCode } = e;
        if (e.altKey) {
            keyCode = keyCode | monaco.KeyMod.Alt;
        }
        if (e.shiftKey) {
            keyCode = keyCode | monaco.KeyMod.Shift;
        }
        if (e.ctrlKey) {
            keyCode = keyCode | monaco.KeyMod.CtrlCmd;
        }
        const binding = this.keybindingRegistry.getKeybinding(keyCode);
        if (binding) {
            const contextId = binding.contextId || KeybindingContext.DEFAULT_CONTEXT.id;
            let context = this.keybindingContextRegistry.getContext(contextId);
            while (context) {
                if (context.enabled(binding)) {
                    const handler = this.commandRegistry.getActiveHandler(binding.commandId);
                    if (handler) {
                        e.preventDefault();
                        handler.execute();
                        return;
                    }
                }
                if (context.parentId) {
                    context = this.keybindingContextRegistry.getContext(context.parentId);
                } else {
                    context = undefined;
                }
            }
        }
    }

}