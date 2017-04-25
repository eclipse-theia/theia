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
    contribute(registry: KeybindingRegistry): void;
}

@injectable()
export abstract class KeybindingContext implements Context<Keybinding> {

    static NOOP_CONTEXT: Context<Keybinding> = {
        id: 'noop.keybinding.context',
        isEnabled(arg?: Keybinding): boolean {
            return true;
        }
    }

    static DEFAULT_CONTEXT: Context<Keybinding> = {
        id: 'default.keybinding.context',
        isEnabled(arg?: Keybinding): boolean {
            return false;
        }
    }

    constructor( @unmanaged() public readonly id: string) {
    }

    abstract isEnabled(arg?: Keybinding): boolean;

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
            contribution.contribute(this);
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
        const bindings = this.keybindings[keyCode.keystoke] || [];
        bindings.push(binding);
        this.keybindings[keyCode.keystoke] = bindings;
        const commands = this.commands[commandId] || [];
        commands.push(binding);
        this.commands[commandId] = bindings;
    }

    /**
     * @param commandId the unique ID of the command for we the associated ke binding are looking for.
     */
    getKeybindingForCommand(commandId: string): Keybinding | undefined {
        return (this.commands[commandId] || []).find(binding => this.isValid(binding));
    }

    /**
     * @param keyCode the key code of the binding we are searching.
     */
    getKeybindingForKeyCode(keyCode: KeyCode): Keybinding | undefined {
        return (this.keybindings[keyCode.keystoke] || []).find(binding => this.isValid(binding));
    }

    private isValid(binding: Keybinding): boolean {
        let cmd = this.commandRegistry.getCommand(binding.commandId);
        if (cmd) {
            let handler = this.commandRegistry.getActiveHandler(cmd.id);
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
        const binding = this.keybindingRegistry.getKeybindingForKeyCode(keyCode);
        if (binding) {
            const context = binding.context || KeybindingContext.NOOP_CONTEXT;
            if (context && context.isEnabled(binding)) {
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