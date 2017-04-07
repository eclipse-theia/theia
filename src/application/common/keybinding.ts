import { CommandRegistry } from './command';
import { injectable, inject, multiInject } from 'inversify';

export class Keybinding {
    commandId: string
    keyCode: number
};

export const KeybindingContribution = Symbol("KeybindingContribution");
export interface KeybindingContribution {
    contribute(registry: KeybindingRegistry): void;
}


@injectable()
export class KeybindingRegistry {

    keybindings: { [index: number]: Keybinding[] }

    constructor( @multiInject(KeybindingContribution) protected contributions: KeybindingContribution[],
        @inject(CommandRegistry) protected commandRegistry: CommandRegistry) {
        for (let contribution of contributions) {
            contribution.contribute(this);
        }
    }

    /**
     * Adds a keybinding to the registry.
     *
     * @param binding
     */
    registerKeyBinding(binding: Keybinding) {
        let bindings = this.keybindings[binding.keyCode];
        if (!bindings) {
            bindings = [];
        }
        bindings.push(binding);
        this.keybindings[binding.keyCode] = bindings;
    }

    /**
     * @param keyCode the keycode for which to look up a Keybinding
     */
    getKeybinding(keyCode: number): Keybinding | undefined {
        let bindings = this.keybindings[keyCode];
        if (bindings) {
            for (let binding of bindings) {
                if (this.isValid(binding)) {
                    return binding;
                }
            }
        }
        return undefined;
    }

    private isValid(binding: Keybinding): boolean {
        let cmd = this.commandRegistry.getCommand(binding.commandId);
        if (cmd) {
            let handler = this.commandRegistry.getActiveHandler(cmd.id);
            if (handler && (!handler.isVisible || handler.isVisible())) {
                return true;
            }
        }
        return false;
    }
}