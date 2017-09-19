/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { ContributionProvider } from './contribution-provider';
import { ILogger, Logger } from './logger';
import { KeybindingRegistry, KeybindingContext, KeybindingContextRegistry, Keybinding, KeybindingContribution, RawKeybinding } from './keybinding';
import { KeyCode, } from './keys';
import { CommandRegistry, CommandContribution, Command } from './command';

const expect = chai.expect;
chai.should();
chai.config.showDiff = true;
chai.config.includeStack = true;

let keybindingRegistry: KeybindingRegistry;

after(() => {

});

describe('keybindings', () => {
    beforeEach(() => {
        keybindingRegistry = new KeybindingRegistry(createCommandRegistry(), createKeybindingContextRegistry(), createKeybindingContributionProvider(), createLogger());
        keybindingRegistry.onStart();
    });

    it("should register the default keybindings", () => {
        const keybinding = keybindingRegistry.getKeybindingForCommand('test.command', { active: false });
        expect(keybinding).is.not.undefined;

        const keybinding2 = keybindingRegistry.getKeybindingForCommand('undefined.command', { active: false });
        expect(keybinding2).is.undefined;
    });

    it("should unregister a keybinding", () => {
        let binding = keybindingRegistry.getKeybindingForCommand('test.command', { active: false });
        expect(binding).is.not.undefined;
        if (binding) {
            keybindingRegistry.unregisterKeybinding(binding);
            binding = keybindingRegistry.getKeybindingForCommand('test.command', { active: false });
            expect(binding).is.undefined;
        }
    });

    it("should set a keymap", () => {
        const rawKeybindings: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ControlLeft+KeyC"
        }];

        keybindingRegistry.setKeymap(rawKeybindings);

        const binding = keybindingRegistry.getKeybindingForCommand('test.command', { active: false });
        if (binding) {
            expect(binding.keyCode.keystroke).to.be.equal("ControlLeft+KeyC");
        }

    });

    it("should reset to default in case of invalid keybinding", () => {
        const rawKeybindings: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ControlLeft+invalid"
        }];

        keybindingRegistry.setKeymap(rawKeybindings);

        const binding = keybindingRegistry.getKeybindingForCommand('test.command', { active: false });
        if (binding) {
            expect(binding.keyCode.keystroke).to.be.equal("ControlLeft+KeyA");
        }
    });

    it("should register a correct keybinding, then default back to the original for a wrong one after", () => {
        let rawKeybindings: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ControlLeft+KeyC"
        }];
        // Get default binding
        const keystroke = keybindingRegistry.getKeybindingForCommand('test.command', { active: false });

        // Set correct new binding
        keybindingRegistry.setKeymap(rawKeybindings);
        const binding = keybindingRegistry.getKeybindingForCommand('test.command', { active: false });
        if (binding) {
            expect(binding.keyCode.keystroke).to.be.equal("ControlLeft+KeyC");
        }

        // Set invalid binding
        rawKeybindings = [{
            command: "test.command",
            keybinding: "ControlLeft+Invalid"
        }];
        keybindingRegistry.setKeymap(rawKeybindings);
        const defaultBinding = keybindingRegistry.getKeybindingForCommand('test.command', { active: false });
        if (defaultBinding) {
            if (keystroke) {
                expect(defaultBinding.keyCode.keystroke).to.be.equal(keystroke.keyCode.keystroke);
            }
        }
    });
});

describe("keys api", () => {
    it("parses a keystroke correctly", () => {
        let keycode = KeyCode.parseKeystroke("ControlLeft+KeyB");
        expect(keycode).is.not.undefined;

        // Invalid keystroke string
        keycode = KeyCode.parseKeystroke("onTrolLeft+keYB");
        expect(keycode).is.undefined;
    });
})

function createKeybindingContextRegistry(): KeybindingContextRegistry {
    const keybindingContextProviderStub = {
        getContributions(): KeybindingContext[] {
            return [{
                id: 'testContext',

                isEnabled(arg?: Keybinding): boolean {
                    return true;
                }
            }];
        }
    };
    const registry = new KeybindingContextRegistry(keybindingContextProviderStub);
    registry.initialize();
    return registry;
}

function createCommandRegistry(): CommandRegistry {

    const TEST_COMMAND: Command = {
        id: 'test.command'
    };
    const commandProviderStub = {
        getContributions(): CommandContribution[] {
            return [{
                registerCommands(commands: CommandRegistry): void {
                    commands.registerCommand(TEST_COMMAND);
                }
            }]
        }
    }

    const registry = new CommandRegistry(commandProviderStub);
    registry.onStart();
    return registry;
}

function createKeybindingContributionProvider(): ContributionProvider<KeybindingContribution> {
    return {
        getContributions(): KeybindingContribution[] {
            return [{
                registerKeyBindings(keybindings: KeybindingRegistry): void {
                    [
                        {
                            commandId: 'test.command',
                            context: {
                                id: 'testContext',
                                isEnabled(arg?: Keybinding): boolean {
                                    return true;
                                }
                            },
                            keyCode: new KeyCode('ControlLeft+KeyA')

                        },
                    ].forEach(binding => {
                        keybindings.registerKeyBinding(binding);
                    });
                }
            }];
        }
    };
}

function createLogger(): ILogger {
    return new Proxy<Logger>({} as any, {
        get: (target, name) => () => {
            if (name.toString().startsWith('is')) {
                return Promise.resolve(false);
            }
            if (name.toString().startsWith('if')) {
                return new Promise(resolve => { });
            }
        }
    });
}
