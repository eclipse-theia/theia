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
import { TheiaKeyCodeUtils, Key } from './keys';
import { CommandRegistry, CommandContribution, Command } from './command';

const expect = chai.expect;
chai.config.showDiff = true;
chai.config.includeStack = true;

let keybindingRegistry: KeybindingRegistry;

describe('keybindings', () => {
    beforeEach(() => {
        keybindingRegistry = new KeybindingRegistry(createCommandRegistry(), createKeybindingContextRegistry(), createKeybindingContributionProvider(), createLogger());
        keybindingRegistry.onStart();
    });

    it("should register the default keybindings", () => {
        const keybinding = keybindingRegistry.getKeybindingsForCommand('test.command', { active: false });
        expect(keybinding).is.not.undefined;

        const keybinding2 = keybindingRegistry.getKeybindingsForCommand('undefined.command', { active: false });
        expect(keybinding2).is.undefined;
    });

    it("should set a keymap", () => {
        const rawKeybindings: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ctrl+c"
        }];

        keybindingRegistry.setKeymap(rawKeybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand('test.command', { active: false });
        if (bindings) {
            expect(bindings[0].keyCode.key).to.be.equal(Key.KEY_C);
            expect(bindings[0].keyCode.ctrl).to.be.true;
        }

    });

    it("should reset to default in case of invalid keybinding", () => {
        const rawKeybindings: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ctrl+invalid"
        }];

        keybindingRegistry.setKeymap(rawKeybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand('test.command', { active: false });
        if (bindings) {
            expect(bindings[0].keyCode.key).to.be.equal(Key.KEY_A);
            expect(bindings[0].keyCode.ctrl).to.be.true;
        }
    });

    it("should remove all keybindings from a command that has multiple keybindings", () => {
        const rawKeybindings: RawKeybinding[] = [{
            command: "test.command2",
            keybinding: "F3"
        }];

        keybindingRegistry.setKeymap(rawKeybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand('test.command2', { active: false });
        if (bindings) {
            expect(bindings.length).to.be.equal(2);
            expect(bindings[0].keyCode.key).to.be.equal(Key.F1);
            expect(bindings[0].keyCode.ctrl).to.be.true;
        }
    });

    it("should register a correct keybinding, then default back to the original for a wrong one after", () => {
        let rawKeybindings: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ctrl+c"
        }];
        // Get default binding
        const keystroke = keybindingRegistry.getKeybindingsForCommand('test.command', { active: false });

        // Set correct new binding
        keybindingRegistry.setKeymap(rawKeybindings);
        const bindings = keybindingRegistry.getKeybindingsForCommand('test.command', { active: false });
        if (bindings) {
            expect(bindings[0].keyCode.key).to.be.equal(Key.KEY_C);
            expect(bindings[0].keyCode.ctrl).to.be.true;
        }

        // Set invalid binding
        rawKeybindings = [{
            command: "test.command",
            keybinding: "ControlLeft+Invalid"
        }];
        keybindingRegistry.setKeymap(rawKeybindings);
        const defaultBindings = keybindingRegistry.getKeybindingsForCommand('test.command', { active: false });
        if (defaultBindings) {
            if (keystroke) {
                expect(defaultBindings[0].keyCode.key).to.be.equal(keystroke[0].keyCode.key);
                expect(defaultBindings[0].keyCode.key).to.be.equal(keystroke[0].keyCode.key);

            }
        }
    });
});

describe("keys api", () => {
    it("parses a keystroke correctly", () => {
        let keycode = TheiaKeyCodeUtils.parseKeystroke("ctrl+b");
        expect(keycode).is.not.undefined;
        if (keycode) {
            expect(keycode.key).is.equal(Key.KEY_B);
            expect(keycode.ctrl).to.be.true;
        }
        // Invalid keystroke string
        keycode = TheiaKeyCodeUtils.parseKeystroke("ctl+b");
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

const TEST_COMMAND: Command = {
    id: 'test.command'
};

const TEST_COMMAND2: Command = {
    id: 'test.command2'
};

function createCommandRegistry(): CommandRegistry {
    const commandProviderStub = {
        getContributions(): CommandContribution[] {
            return [{
                registerCommands(commands: CommandRegistry): void {
                    commands.registerCommand(TEST_COMMAND);
                    commands.registerCommand(TEST_COMMAND2);
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
                registerDefaultKeyBindings(keybindings: KeybindingRegistry): void {
                    [
                        {
                            commandId: TEST_COMMAND.id,
                            context: {
                                id: 'testContext',
                                isEnabled(arg?: Keybinding): boolean {
                                    return true;
                                }
                            },
                            // Ctrl + A
                            keyCode: {
                                key: Key.KEY_A,
                                ctrl: true,
                                alt: false,
                                shift: false,
                                meta: false
                            }
                        },
                        {
                            commandId: TEST_COMMAND2.id,
                            context: {
                                id: 'testContext',
                                isEnabled(arg?: Keybinding): boolean {
                                    return true;
                                }
                            },
                            keyCode: {
                                key: Key.F1,
                                ctrl: true,
                                alt: false,
                                shift: false,
                                meta: false
                            }
                        },
                        {
                            commandId: TEST_COMMAND2.id,
                            context: {
                                id: 'testContext',
                                isEnabled(arg?: Keybinding): boolean {
                                    return true;
                                }
                            },
                            keyCode: {
                                key: Key.F2,
                                ctrl: true,
                                alt: false,
                                shift: false,
                                meta: false
                            }

                        },
                    ].forEach(binding => {
                        keybindings.registerDefaultKeyBinding(binding);
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
