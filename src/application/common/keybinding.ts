import { PredicateFunc, PredicateImpl } from './predicates';
import { Context } from './context';
import { Disposable } from './disposable';
import { CommandRegistry } from './command';
import { injectable, inject, multiInject, unmanaged } from 'inversify';
import { KeyCode, Accelerator } from './keys';


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
    getKeybindings(): Keybinding[];
}

@injectable()
export class KeybindingContext extends PredicateImpl<Keybinding> implements Context<Keybinding> {

    static DEFAULT_CONTEXT = new KeybindingContext('default.keybinding.context', (binding: Keybinding): boolean => true);
    static NOOP_CONTEXT = new KeybindingContext('noop.keybinding.context', (binding: Keybinding): boolean => false);

    constructor( @unmanaged() public readonly id: string, @unmanaged() public readonly active: PredicateFunc<Keybinding>) {
        super(active);
    }

}

@injectable()
export class KeybindingContextRegistry {

    contexts: { [id: string]: KeybindingContext };
    contextHierarchy: { [id: string]: KeybindingContext };

    constructor( @multiInject(KeybindingContext) contexts: KeybindingContext[]) {
        this.contexts = {};
        this.contexts[KeybindingContext.NOOP_CONTEXT.id] = KeybindingContext.NOOP_CONTEXT;
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
        }
    }

    getContext(contextId: string): KeybindingContext | undefined {
        return this.contexts[contextId];
    }

}

@injectable()
export class KeybindingRegistry {

    keybindings: { [index: string]: Keybinding[] }
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
        new KeyEventEmitter(commandRegistry, this);
    }

    /**
     * Adds a keybinding to the registry.
     *
     * @param binding
     */
    registerKeyBinding(binding: Keybinding) {
        const { keyCode, commandId } = binding;
        const bindings = this.keybindings[keyCode.sequence] || [];
        bindings.push(binding);
        this.keybindings[keyCode.sequence] = bindings;
        const commands = this.commands[commandId] || [];
        commands.push(binding);
        this.commands[commandId] = bindings;
    }

    /**
     * @param keyCode the keycode for which to look up a Keybinding
     */
    getKeybinding(keyCodeOrCommandId: KeyCode | string): Keybinding | undefined {
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

    private getBindings(keyCodeOrCommandId: KeyCode | string): Keybinding[] {
        if (typeof keyCodeOrCommandId === 'string') {
            return this.commands[keyCodeOrCommandId];
        } else {
            return this.keybindings[keyCodeOrCommandId.sequence];
        }
    }
}

export class KeyEventEmitter implements Disposable {

    private listener: EventListenerOrEventListenerObject;

    constructor(
        private commandRegistry: CommandRegistry,
        private keybindingRegistry: KeybindingRegistry) {

        this.listener = (event: any) => this.handleEvent(event);
        window.addEventListener('keydown', this.listener, true);
    }

    dispose() {
        window.removeEventListener('keydown', this.listener);
    }

    private handleEvent(event: KeyboardEvent): void {
        if (!event.defaultPrevented && this.handleKey(KeyCode.createKeyCode(event))) {
            event.preventDefault();
        }
    }

    private handleKey(keyCode: KeyCode): boolean {
        const binding = this.keybindingRegistry.getKeybinding(keyCode);
        if (binding) {
            const context = binding.context || KeybindingContext.NOOP_CONTEXT;
            if (context && context.active(binding)) {
                const handler = this.commandRegistry.getActiveHandler(binding.commandId);
                if (handler) {
                    handler.execute();
                    return true;
                }
            }
        }
        return false;
    }

}