import { CommandRegistry, Enabled } from './command';
import { injectable, inject, multiInject } from 'inversify';

export declare type Accelerator = (keybinding: Keybinding) => string[];

export namespace Accelerator {
    export const NOOP: Accelerator = (keybinding) => [];
}

export interface Keybinding {
    commandId: string;
    keyCode: number;
    isEnabled?: Enabled;
    /**
     * Sugar for showing the keybindings in the menus.
     */
    accelerator?: Accelerator;
};

export const KeybindingContribution = Symbol("KeybindingContribution");
export interface KeybindingContribution {
    getKeybindings(): Keybinding[];
}


@injectable()
export class KeybindingRegistry {

    keybindings: { [index: number]: Keybinding[] }
    commands: { [commandId: string]: Keybinding[] }

    constructor( @multiInject(KeybindingContribution) protected contributions: KeybindingContribution[],
        @inject(CommandRegistry) protected commandRegistry: CommandRegistry) {

        this.keybindings = {};
        this.commands = {};
        for (let contribution of contributions) {
            for (let keyb of contribution.getKeybindings()) {
                this.registerKeyBinding(keyb);
            }
        }
    }

    /**
     * Adds a keybinding to the registry.
     *
     * @param binding
     */
    registerKeyBinding(binding: Keybinding) {
        const {keyCode, commandId} = binding;
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
            return this.commands[keyCodeOrCommandId];
        }
    }
}