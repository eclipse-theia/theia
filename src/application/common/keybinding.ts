import { Disposable } from './disposable';
import { isOSX } from './os';
import { CommandRegistry, Enabled } from './command';
import { injectable, inject, multiInject } from 'inversify';

export interface Keybinding {
    readonly commandId: string;
    readonly keyCode: KeyCode;
    /**
     * The optional keybinding context ID of the context this binding belongs to.
     * If not specified, then this keybinding context belongs to the NOOP
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
    readonly active: (binding: Keybinding) => boolean;

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
        active: (binding: Keybinding): boolean => true
    };

    export const NOOP_CONTEXT: KeybindingContext = {
        id: 'no.keybinding.context',
        active: (binding: Keybinding): boolean => false
    };
}

@injectable()
export class KeybindingContextRegistry {

    contexts: { [id: string]: KeybindingContext };
    contextHierarchy: { [id: string]: KeybindingContext };

    constructor( @multiInject(KeybindingContext.KeybindingContext) contexts: KeybindingContext[]) {
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
        new KeyEventEmitter(commandRegistry, this, contextRegistry);
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
        private keybindingRegistry: KeybindingRegistry,
        private keybindingContextRegistry: KeybindingContextRegistry) {

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
            const contextId = binding.contextId || KeybindingContext.NOOP_CONTEXT.id;
            let context = this.keybindingContextRegistry.getContext(contextId);
            while (context) {
                if (context.active(binding)) {
                    const handler = this.commandRegistry.getActiveHandler(binding.commandId);
                    if (handler) {
                        handler.execute();
                        return true;
                    }
                }
                if (context.parentId) {
                    context = this.keybindingContextRegistry.getContext(context.parentId);
                } else {
                    context = undefined;
                }
            }
        }
        return false;
    }

}

export enum Modifier {
    /**
     * M1 is the COMMAND key on MacOS X, and the CTRL key on most other platforms.
     */
    M1 = 1,
    /**
     * M2 is the SHIFT key.
     */
    M2 = 2,
    /**
     * M3 is the Option key on MacOS X, and the ALT key on most other platforms.
     */
    M3 = 3,
    /**
     * M4 is the CTRL key on MacOS X, and is undefined on other platforms.
     */
    M4 = 4
}

export namespace Modifier {
    export function label(modifier: Modifier): string {
        switch (modifier) {
            case 1: return "M1";
            case 2: return "M2";
            case 3: return "M3";
            case 4: return "M4";
            default: throw new Error(`Unexpected modifier type: ${modifier}.`);
        }
    }
}

export enum Key {
    Backspace = 8,
    Tab = 9,
    Enter = 13,
    PauseBreak = 19,
    CapsLock = 20,
    Escape = 27,
    Space = 32,
    PageUp = 33,
    PageDown = 34,
    End = 35,
    Home = 36,
    LeftArrow = 37,
    UpArrow = 38,
    RightArrow = 39,
    DownArrow = 40,
    Insert = 45,
    Delete = 46,
    Zero = 48,
    ClosedParen = 48,
    One = 49,
    ExclamationMark = 49,
    Two = 50,
    AtSign = 50,
    Three = 51,
    PoundSign = 51,
    Hash = 51,
    Four = 52,
    DollarSign = 52,
    Five = 53,
    PercentSign = 53,
    Six = 54,
    Caret = 54,
    Hat = 54,
    Seven = 55,
    Ampersand = 55,
    Eight = 56,
    Star = 56,
    Asterik = 56,
    Nine = 57,
    OpenParen = 57,
    A = 65,
    B = 66,
    C = 67,
    D = 68,
    E = 69,
    F = 70,
    G = 71,
    H = 72,
    I = 73,
    J = 74,
    K = 75,
    L = 76,
    M = 77,
    N = 78,
    O = 79,
    P = 80,
    Q = 81,
    R = 82,
    S = 83,
    T = 84,
    U = 85,
    V = 86,
    W = 87,
    X = 88,
    Y = 89,
    Z = 90,
    SelectKey = 93,
    Numpad0 = 96,
    Numpad1 = 97,
    Numpad2 = 98,
    Numpad3 = 99,
    Numpad4 = 100,
    Numpad5 = 101,
    Numpad6 = 102,
    Numpad7 = 103,
    Numpad8 = 104,
    Numpad9 = 105,
    Multiply = 106,
    Add = 107,
    Subtract = 109,
    DecimalPoint = 110,
    Divide = 111,
    F1 = 112,
    F2 = 113,
    F3 = 114,
    F4 = 115,
    F5 = 116,
    F6 = 117,
    F7 = 118,
    F8 = 119,
    F9 = 120,
    F10 = 121,
    F11 = 122,
    F12 = 123,
    NumLock = 144,
    ScrollLock = 145,
    SemiColon = 186,
    Equals = 187,
    Comma = 188,
    Dash = 189,
    Period = 190,
    UnderScore = 189,
    PlusSign = 187,
    ForwardSlash = 191,
    Tilde = 192,
    GraveAccent = 192,
    OpenBracket = 219,
    ClosedBracket = 221,
    Quote = 222,
}
