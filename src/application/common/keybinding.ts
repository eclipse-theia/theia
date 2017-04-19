import { PredicateFunc, PredicateImpl } from './predicates';
import { Context } from './context';
import { Disposable } from './disposable';
import { isOSX } from './os';
import { CommandRegistry } from './command';
import { injectable, inject, multiInject, unmanaged } from 'inversify';
import { Key, Modifier } from './keys';


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

export declare type Accelerator = string[];

export const AcceleratorProvider = Symbol("AcceleratorProvider");
export interface AcceleratorProvider {

    getAccelerator(keyCode: KeyCode): Accelerator

}

/**
 * The key sequence for this binding. This key sequence should consist of one or more key strokes. Key strokes
 * consist of one or more keys held down at the same time. This should be zero or more modifier keys, and one other key.
 * Since `M2+M3+<Key>` (Alt+Shift+<Key>) is reserved on MacOS X for writing special characters, such bindings are commonly
 * undefined for platform MacOS X and redefined as `M1+M3+<Key>`. The rule applies on the `M3+M2+<Key>` sequence.
 */
export declare type KeySequence = { first: Key, firstModifier?: Modifier, secondModifier?: Modifier, thirdModifier?: Modifier };

/**
 * Representation of a platform independent key code.
 */
export class KeyCode {

    private static GET_MODIFIERS = (sequence: KeySequence): Modifier[] => {
        const modifiers: Modifier[] = [];
        for (const modifier of [sequence.firstModifier, sequence.secondModifier, sequence.thirdModifier]) {
            if (modifier) {
                if (modifiers.indexOf(modifier) >= 0) {
                    throw new Error(`Key sequence ${JSON.stringify(sequence)} contains duplicate modifiers.`);
                }
                modifiers.push(modifier);
            }
        }
        return modifiers.sort();
    }

    // TODO: support chrods properly. Currently, second sequence is ignored.
    private constructor(public readonly sequence: string) {
        // const chord = ((secondSequence & 0x0000ffff) << 16) >>> 0;
        // (firstSequence | chord) >>> 0;
    }

    public static createKeyCode(event: KeyboardEvent | KeySequence): KeyCode {
        if (event instanceof KeyboardEvent) {
            const e: any = event;

            const sequence: string[] = [];
            if (e.keyCode) {
                sequence.push(String.fromCharCode(e.keyCode));
            } else if (e.which) {
                sequence.push(String.fromCharCode(e.keyCode));
            } else if (e.code) {
                sequence.push(e.code);
            } else if (e.key) {
                sequence.push(e.key);
            } else if (e.keyIdentifier) {
                sequence.push(e.keyIdentifier);
            } else {
                throw new Error(`Cannot get key code from the keyborard event: ${event}.`);
            }

            // CTRL + COMMAND (M1)
            if ((isOSX && event.metaKey) || event.ctrlKey) {
                sequence.push(Modifier.label(Modifier.M1));
            }

            // SHIFT (M2)
            if (event.shiftKey) {
                sequence.push(Modifier.label(Modifier.M2));
            }

            // ALT (M3)
            if (event.altKey) {
                sequence.push(Modifier.label(Modifier.M3));
            }

            // CTRL on MacOS X (M4)
            if (isOSX && !event.metaKey && event.ctrlKey) {
                sequence.push(Modifier.label(Modifier.M4));
            }

            return new KeyCode(sequence.join('+'));
        } else {
            const a = [String.fromCharCode(event.first)]
                .concat(KeyCode.GET_MODIFIERS(event).map(modifier => Modifier.label(modifier)))
                .join('+');
            console.log(a);
            return new KeyCode([String.fromCharCode(event.first)]
                .concat(KeyCode.GET_MODIFIERS(event).map(modifier => Modifier.label(modifier)))
                .join('+'));
        }
    }

    equals(event: KeyboardEvent | KeyCode): boolean {
        return (event instanceof KeyCode ? event : KeyCode.createKeyCode(event)).sequence === this.sequence;
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
        console.log('KEYCODE', keyCode);
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