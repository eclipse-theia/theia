/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container, injectable, ContainerModule } from 'inversify';
import { bindContributionProvider } from './contribution-provider';
import { ILogger } from './logger';
import { KeybindingRegistry, KeybindingContext, KeybindingContextRegistry, Keybinding, KeybindingContribution, KeybindingScope, RawKeybinding } from './keybinding';
import { KeyCode, Key, Modifier } from './keys';
import { CommandRegistry, CommandContribution, Command } from './command';
import { MockLogger } from './test/mock-logger';
import * as chai from 'chai';
const jsdom = require('jsdom-global');

const expect = chai.expect;
chai.config.showDiff = true;
chai.config.includeStack = true;

let keybindingRegistry: KeybindingRegistry;
let commandRegistry: CommandRegistry;
let testContainer: Container;

before(async () => {
    jsdom();
    testContainer = new Container();
    const module = new ContainerModule((bind, unbind, isBound, rebind) => {

        /* Mock logger binding*/
        bind(ILogger).to(MockLogger);

        bind(KeybindingContextRegistry).toSelf();
        bindContributionProvider(bind, KeybindingContext);

        bind(CommandRegistry).toSelf().inSingletonScope();
        bindContributionProvider(bind, CommandContribution);

        bind(KeybindingRegistry).toSelf();
        bindContributionProvider(bind, KeybindingContribution);

        bind(TestContribution).toSelf().inSingletonScope();
        [CommandContribution, KeybindingContribution].forEach(serviceIdentifier =>
            bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(TestContribution)).inSingletonScope()
        );

        bind(TestContext).toSelf().inSingletonScope();
        bind(KeybindingContext).toDynamicValue(context => context.container.get(TestContext)).inSingletonScope();
    });

    testContainer.load(module);

    commandRegistry = testContainer.get(CommandRegistry);
    commandRegistry.onStart();

});

describe('keybindings', () => {
    beforeEach(() => {
        keybindingRegistry = testContainer.get<KeybindingRegistry>(KeybindingRegistry);
        keybindingRegistry.onStart();
    });

    it("should register the default keybindings", () => {
        const keybinding = keybindingRegistry.getKeybindingsForCommand('test.command');
        expect(keybinding).is.not.undefined;

        const keybinding2 = keybindingRegistry.getKeybindingsForCommand('undefined.command');
        expect(keybinding2.length).is.equal(0);
    });

    it("should set a keymap", () => {
        const rawKeybindings: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ctrl+c"
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, rawKeybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand('test.command');
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

        keybindingRegistry.setKeymap(KeybindingScope.USER, rawKeybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand('test.command');
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

        keybindingRegistry.setKeymap(KeybindingScope.USER, rawKeybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand('test.command2');
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
        const keystroke = keybindingRegistry.getKeybindingsForCommand('test.command');

        // Set correct new binding
        keybindingRegistry.setKeymap(KeybindingScope.USER, rawKeybindings);
        const bindings = keybindingRegistry.getKeybindingsForCommand('test.command');
        if (bindings) {
            expect(bindings[0].keyCode.key).to.be.equal(Key.KEY_C);
            expect(bindings[0].keyCode.ctrl).to.be.true;
        }

        // Set invalid binding
        rawKeybindings = [{
            command: "test.command",
            keybinding: "ControlLeft+Invalid"
        }];
        keybindingRegistry.setKeymap(KeybindingScope.USER, rawKeybindings);
        const defaultBindings = keybindingRegistry.getKeybindingsForCommand('test.command');
        if (defaultBindings) {
            if (keystroke) {
                expect(defaultBindings[0].keyCode.key).to.be.equal(keystroke[0].keyCode.key);
                expect(defaultBindings[0].keyCode.key).to.be.equal(keystroke[0].keyCode.key);

            }
        }
    });

    it("should only return the more specific keybindings when a keystroke is entered", () => {
        const rawKeybindingsUser: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ctrl+b"
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, rawKeybindingsUser);

        const rawKeybindingsSpecific: RawKeybinding[] = [{
            command: "test.command",
            keybinding: "ctrl+c"
        }];

        const validKeyCode = KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [Modifier.M1] });

        keybindingRegistry.setKeymap(KeybindingScope.WORKSPACE, rawKeybindingsSpecific);

        let bindings = keybindingRegistry.getKeybindingsForKeyCode(KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [Modifier.M1] }));
        expect(bindings).to.be.empty;

        bindings = keybindingRegistry.getKeybindingsForKeyCode(KeyCode.createKeyCode({ first: Key.KEY_B, modifiers: [Modifier.M1] }));
        expect(bindings).to.be.empty;

        bindings = keybindingRegistry.getKeybindingsForKeyCode(KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [Modifier.M1] }));
        expect(bindings[0].keyCode.key).to.be.equal(validKeyCode.key);
    });
});

describe("keys api", () => {
    it("parses a string to a KeyCode correctly", () => {
        let keycode = KeyCode.parse("ctrl+b");
        expect(keycode).is.not.undefined;
        if (keycode) {
            expect(keycode.key).is.equal(Key.KEY_B);
            expect(keycode.ctrl).to.be.true;
        }
        // Invalid keystroke string
        keycode = KeyCode.parse("ctl+b");
        expect(keycode).is.undefined;
    });
});

const TEST_COMMAND: Command = {
    id: 'test.command'
};

const TEST_COMMAND2: Command = {
    id: 'test.command2'
};

@injectable()
export class TestContribution implements CommandContribution, KeybindingContribution {

    constructor(
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TEST_COMMAND);
        commands.registerCommand(TEST_COMMAND2);
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        const keycode1 = KeyCode.parse('ctrl+a');
        const keycode2 = KeyCode.parse('ctrl+f1');
        const keycode3 = KeyCode.parse('ctrl+f2');
        if (keycode1 && keycode2 && keycode3) {
            [
                {
                    commandId: TEST_COMMAND.id,
                    context: {
                        id: 'testContext',
                        isEnabled(arg?: Keybinding): boolean {
                            return true;
                        }
                    },
                    keyCode: keycode1
                },
                {
                    commandId: TEST_COMMAND2.id,
                    context: {
                        id: 'testContext',
                        isEnabled(arg?: Keybinding): boolean {
                            return true;
                        }
                    },
                    keyCode: keycode2
                },
                {
                    commandId: TEST_COMMAND2.id,
                    context: {
                        id: 'testContext',
                        isEnabled(arg?: Keybinding): boolean {
                            return true;
                        }
                    },
                    keyCode: keycode3
                },
            ].forEach(binding => {
                keybindings.registerKeybinding(binding);
            });
        }

    }
}

@injectable()
export class TestContext implements KeybindingContext {

    constructor() { }

    id = 'testContext';

    isEnabled(arg?: Keybinding) {
        return true;
    }
}
