/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import { enableJSDOM } from '../browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { Container, injectable, ContainerModule } from 'inversify';
import { bindContributionProvider } from '../common/contribution-provider';
import { ILogger } from '../common/logger';
import { KeybindingRegistry, KeybindingContext, Keybinding, KeybindingContribution, KeybindingScope } from './keybinding';
import { KeyCode, Key, KeyModifier, KeySequence, EasyKey } from './keys';
import { CommandRegistry, CommandService, CommandContribution, Command } from '../common/command';
import { LabelParser } from './label-parser';
import { MockLogger } from '../common/test/mock-logger';
import { StatusBar, StatusBarImpl } from './status-bar/status-bar';
import { FrontendApplicationStateService } from './frontend-application-state';
import * as os from '../common/os';
import * as chai from 'chai';
import * as sinon from 'sinon';

disableJSDOM();

/* tslint:disable:no-unused-expression */

const expect = chai.expect;

let keybindingRegistry: KeybindingRegistry;
let commandRegistry: CommandRegistry;
let testContainer: Container;

before(async () => {
    testContainer = new Container();
    const module = new ContainerModule((bind, unbind, isBound, rebind) => {

        /* Mock logger binding*/
        bind(ILogger).to(MockLogger);

        bindContributionProvider(bind, KeybindingContext);

        bind(CommandRegistry).toSelf().inSingletonScope();
        bindContributionProvider(bind, CommandContribution);

        bind(KeybindingRegistry).toSelf();
        bindContributionProvider(bind, KeybindingContribution);

        bind(TestContribution).toSelf().inSingletonScope();
        [CommandContribution, KeybindingContribution].forEach(serviceIdentifier =>
            bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(TestContribution)).inSingletonScope()
        );

        bind(KeybindingContext).toConstantValue({
            id: 'testContext',
            isEnabled(arg?: Keybinding): boolean {
                return true;
            }
        });

        bind(StatusBarImpl).toSelf().inSingletonScope();
        bind(StatusBar).toDynamicValue(ctx => ctx.container.get(StatusBarImpl)).inSingletonScope();
        bind(CommandService).toDynamicValue(context => context.container.get(CommandRegistry));
        bind(LabelParser).toSelf().inSingletonScope();
        bind(FrontendApplicationStateService).toSelf().inSingletonScope();
    });

    testContainer.load(module);

    commandRegistry = testContainer.get(CommandRegistry);
    commandRegistry.onStart();

});

describe('keybindings', () => {

    let stub: sinon.SinonStub;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        stub = sinon.stub(os, 'isOSX').value(false);
        keybindingRegistry = testContainer.get<KeybindingRegistry>(KeybindingRegistry);
        keybindingRegistry.onStart();
    });

    afterEach(() => {
        stub.restore();
    });

    it("should register the default keybindings", () => {
        const keybinding = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);
        expect(keybinding).is.not.undefined;

        const keybinding2 = keybindingRegistry.getKeybindingsForCommand('undefined.command');
        expect(keybinding2.length).is.equal(0);
    });

    it("should set a keymap", () => {
        const keybindings: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: "ctrl+c"
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);
        if (bindings) {
            const keyCode = KeyCode.parse(bindings[0].keybinding);
            expect(keyCode.key).to.be.equal(Key.KEY_C);
            expect(keyCode.ctrl).to.be.true;
        }

    });

    it("should reset to default in case of invalid keybinding", () => {
        const keybindings: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: "ctrl+invalid"
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);
        if (bindings) {
            const keyCode = KeyCode.parse(bindings[0].keybinding);
            expect(keyCode.key).to.be.equal(Key.KEY_A);
            expect(keyCode.ctrl).to.be.true;
        }
    });

    it("should remove all keybindings from a command that has multiple keybindings", () => {
        const keybindings: Keybinding[] = [{
            command: TEST_COMMAND2.id,
            keybinding: "F3"
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND2.id);
        if (bindings) {
            expect(bindings.length).to.be.equal(2);
            const keyCode = KeyCode.parse(bindings[0].keybinding);
            expect(keyCode.key).to.be.equal(Key.F1);
            expect(keyCode.ctrl).to.be.true;
        }
    });

    it("should register a correct keybinding, then default back to the original for a wrong one after", () => {
        let keybindings: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: "ctrl+c"
        }];

        // Get default binding
        const keystroke = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);

        // Set correct new binding
        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);
        const bindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);
        if (bindings) {
            const keyCode = KeyCode.parse(bindings[0].keybinding);
            expect(keyCode.key).to.be.equal(Key.KEY_C);
            expect(keyCode.ctrl).to.be.true;
        }

        // Set invalid binding
        keybindings = [{
            command: TEST_COMMAND.id,
            keybinding: "ControlLeft+Invalid"
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);

        const defaultBindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);
        if (defaultBindings) {
            if (keystroke) {
                const keyCode = KeyCode.parse(defaultBindings[0].keybinding);
                const keyStrokeCode = KeyCode.parse(keystroke[0].keybinding);
                expect(keyCode.key).to.be.equal(keyStrokeCode.key);
            }
        }
    });

    it("should only return the more specific keybindings when a keystroke is entered", () => {
        const keybindingsUser: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: "ctrl+b"
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindingsUser);

        const keybindingsSpecific: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: "ctrl+c"
        }];

        const validKeyCode = KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd] });

        keybindingRegistry.setKeymap(KeybindingScope.WORKSPACE, keybindingsSpecific);

        let bindings = keybindingRegistry.getKeybindingsForKeySequence([KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })]).full;
        expect(bindings).to.have.lengthOf(1);

        bindings = keybindingRegistry.getKeybindingsForKeySequence([KeyCode.createKeyCode({ first: Key.KEY_B, modifiers: [KeyModifier.CtrlCmd] })]).full;
        expect(bindings).to.have.lengthOf(1);

        bindings = keybindingRegistry.getKeybindingsForKeySequence([KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd] })]).full;
        const keyCode = KeyCode.parse(bindings[0].keybinding);
        expect(keyCode.key).to.be.equal(validKeyCode.key);
    });

    it("should return partial keybinding matches", () => {
        const keybindingsUser: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: "ctrlcmd+x t"
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindingsUser);

        const validKeyCodes = [];
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd] }));
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_T }));

        const bindings = keybindingRegistry.getKeybindingsForKeySequence(KeySequence.parse("ctrlcmd+x"));
        expect(bindings.partial.length > 0);
    });

    it("should not register a shadowing keybinding", () => {
        const validKeyBinding = "ctrlcmd+b a";
        const command = TEST_COMMAND_SHADOW.id;
        const keybindingShadowing: Keybinding[] = [
            {
                command,
                keybinding: validKeyBinding
            },
            {
                command,
                keybinding: "ctrlcmd+b"
            }
        ];

        keybindingRegistry.registerKeybindings(...keybindingShadowing);

        const bindings = keybindingRegistry.getKeybindingsForCommand(command);
        expect(bindings.length).to.be.equal(1);
        expect(bindings[0].keybinding).to.be.equal(validKeyBinding);
    });

    it("shadowed bindings should not be returned", () => {
        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift] });
        let bindings: Keybinding[];

        const ignoredDefaultBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: "test.ignored-command"
        };

        const defaultBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: "test.workspace-command"
        };

        const userBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: "test.workspace-command"
        };

        const workspaceBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: "test.workspace-command"
        };

        keybindingRegistry.setKeymap(KeybindingScope.DEFAULT, [defaultBinding, ignoredDefaultBinding]);
        keybindingRegistry.setKeymap(KeybindingScope.USER, [userBinding]);
        keybindingRegistry.setKeymap(KeybindingScope.WORKSPACE, [workspaceBinding]);
        // now WORKSPACE bindings are overriding the other scopes

        bindings = keybindingRegistry.getKeybindingsForKeySequence([keyCode]).full;
        expect(bindings).to.have.lengthOf(1);
        expect(bindings[0].command).to.be.equal(workspaceBinding.command);

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.WORKSPACE);
        // now it should find USER bindings

        bindings = keybindingRegistry.getKeybindingsForKeySequence([keyCode]).full;
        expect(bindings).to.have.lengthOf(1);
        expect(bindings[0].command).to.be.equal(userBinding.command);

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.USER);
        // and finally it should fallback to DEFAULT bindings.

        bindings = keybindingRegistry.getKeybindingsForKeySequence([keyCode]).full;
        expect(bindings).to.have.lengthOf(1);
        expect(bindings[0].command).to.be.equal(defaultBinding.command);

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.DEFAULT);
        // now the registry should be empty

        bindings = keybindingRegistry.getKeybindingsForKeySequence([keyCode]).full;
        expect(bindings).to.be.empty;

    });
});

describe("keys api", () => {
    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it("should parse a string to a KeyCode correctly", () => {

        const keycode = KeyCode.parse("ctrl+b");
        expect(keycode.ctrl).to.be.true;
        expect(keycode.key).is.equal(Key.KEY_B);

        // Invalid keystroke string
        expect(() => KeyCode.parse("ctl+b")).to.throw(Error);

    });

    it("should parse a string containing special modifiers to a KeyCode correctly", () => {
        const stub = sinon.stub(os, 'isOSX').value(false);
        const keycode = KeyCode.parse("ctrl+b");
        expect(keycode.ctrl).to.be.true;
        expect(keycode.key).is.equal(Key.KEY_B);

        const keycodeOption = KeyCode.parse("option+b");
        expect(keycodeOption.alt).to.be.true;
        expect(keycodeOption.key).is.equal(Key.KEY_B);

        expect(() => KeyCode.parse("cmd+b")).to.throw(/OSX only/);

        const keycodeCtrlOrCommand = KeyCode.parse("ctrlcmd+b");
        expect(keycodeCtrlOrCommand.meta).to.be.false;
        expect(keycodeCtrlOrCommand.ctrl).to.be.true;
        expect(keycodeCtrlOrCommand.key).is.equal(Key.KEY_B);
        stub.restore();
    });

    it("should parse a string containing special modifiers to a KeyCode correctly (macOS)", () => {
        KeyCode.resetKeyBindings();
        const stub = sinon.stub(os, 'isOSX').value(true);
        const keycode = KeyCode.parse("ctrl+b");
        expect(keycode.ctrl).to.be.true;
        expect(keycode.key).is.equal(Key.KEY_B);

        const keycodeOption = KeyCode.parse("option+b");
        expect(keycodeOption.alt).to.be.true;
        expect(keycodeOption.key).is.equal(Key.KEY_B);

        const keycodeCommand = KeyCode.parse("cmd+b");
        expect(keycodeCommand.meta).to.be.true;
        expect(keycodeCommand.key).is.equal(Key.KEY_B);

        const keycodeCtrlOrCommand = KeyCode.parse("ctrlcmd+b");
        expect(keycodeCtrlOrCommand.meta).to.be.true;
        expect(keycodeCtrlOrCommand.ctrl).to.be.false;
        expect(keycodeCtrlOrCommand.key).is.equal(Key.KEY_B);

        stub.restore();
    });

    it("it should serialize a keycode properly with BACKQUOTE + M1", () => {
        const stub = sinon.stub(os, 'isOSX').value(true);
        let keyCode = KeyCode.createKeyCode({ first: Key.BACKQUOTE, modifiers: [KeyModifier.CtrlCmd] });
        let keyCodeString = keyCode.toString();
        expect(keyCodeString).to.be.equal("meta+`");
        let parsedKeyCode = KeyCode.parse(keyCodeString);
        expect(KeyCode.equals(parsedKeyCode, keyCode)).to.be.true;

        sinon.stub(os, 'isOSX').value(false);
        keyCode = KeyCode.createKeyCode({ first: Key.BACKQUOTE, modifiers: [KeyModifier.CtrlCmd] });
        keyCodeString = keyCode.toString();
        expect(keyCodeString).to.be.equal("ctrl+`");
        parsedKeyCode = KeyCode.parse(keyCodeString);
        expect(KeyCode.equals(parsedKeyCode, keyCode)).to.be.true;

        stub.restore();
    });

    it("it should serialize a keycode properly with a + M2 + M3", () => {
        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift, KeyModifier.Alt] });
        const keyCodeString = keyCode.toString();
        expect(keyCodeString).to.be.equal("shift+alt+a");
        const parsedKeyCode = KeyCode.parse(keyCodeString);
        expect(KeyCode.equals(parsedKeyCode, keyCode)).to.be.true;
    });

    it("the order of the modifiers should not matter when parsing the key code", () => {
        const left = KeySequence.parse("shift+alt+a");
        const right = KeySequence.parse("alt+shift+a");
        expect(KeySequence.compare(left, right)).to.be.equal(KeySequence.CompareResult.FULL);

        expect(KeySequence.compare(
            [KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Alt, KeyModifier.Shift] })], right)).to.be.equal(
                KeySequence.CompareResult.FULL);
        expect(KeySequence.compare(
            left, [KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Alt, KeyModifier.Shift] })])).to.be.equal(
                KeySequence.CompareResult.FULL);

        expect(KeySequence.compare(
            [KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift, KeyModifier.Alt] })], right)).to.be.equal(
                KeySequence.CompareResult.FULL);
        expect(KeySequence.compare(
            left, [KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift, KeyModifier.Alt] })])).to.be.equal(
                KeySequence.CompareResult.FULL);
    });

    it("it should parse ctrl key properly on both OS X and other platforms", () => {
        const event = new KeyboardEvent('keydown', {
            key: EasyKey.BACKQUOTE.easyString,
            code: Key.BACKQUOTE.code,
            ctrlKey: true,
        });
        const stub = sinon.stub(os, 'isOSX').value(true);
        expect(KeyCode.createKeyCode(event).keystroke).to.be.equal('Backquote+M4');
        sinon.stub(os, 'isOSX').value(false);
        expect(KeyCode.createKeyCode(event).keystroke).to.be.equal('Backquote+M1');
        stub.restore();
    });

    it("it should serialize a keycode properly with a + M4", () => {
        const stub = sinon.stub(os, 'isOSX').value(true);
        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.MacCtrl] });
        const keyCodeString = keyCode.toString();
        expect(keyCodeString).to.be.equal("ctrl+a");
        const parsedKeyCode = KeyCode.parse(keyCodeString);
        expect(KeyCode.equals(parsedKeyCode, keyCode)).to.be.true;
        stub.restore();
    });

    it("it should parse a multi keycode keybinding", () => {
        const validKeyCodes = [];
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] }));
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd, KeyModifier.Shift] }));

        const parsedKeyCodes = KeySequence.parse("ctrlcmd+a ctrlcmd+shift+c");
        expect(parsedKeyCodes).to.deep.equal(validKeyCodes);
    });

    it("it should parse a multi keycode keybinding with no modifiers", () => {
        const validKeyCodes = [];
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] }));
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_C }));

        const parsedKeyCodes = KeySequence.parse("ctrlcmd+a c");
        expect(parsedKeyCodes).to.deep.equal(validKeyCodes);
    });

    it("it should compare keysequences properly", () => {
        let a = KeySequence.parse("ctrlcmd+a");
        let b = KeySequence.parse("ctrlcmd+a t");

        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.PARTIAL);

        a = KeySequence.parse("ctrlcmd+a t");
        b = KeySequence.parse("ctrlcmd+a");

        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.SHADOW);

        a = KeySequence.parse("ctrlcmd+a t");
        b = KeySequence.parse("ctrlcmd+a b c");
        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.NONE);

        a = KeySequence.parse("ctrlcmd+a t");
        b = KeySequence.parse("ctrlcmd+a a");
        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.NONE);

        a = KeySequence.parse("ctrlcmd+a t");
        b = KeySequence.parse("ctrlcmd+a t");
        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.FULL);

        a = KeySequence.parse("ctrlcmd+a t b");
        b = KeySequence.parse("ctrlcmd+a t b");
        expect(KeySequence.compare(a, b)).to.be.equal(KeySequence.CompareResult.FULL);
    });

    it("it should be a modifier only", () => {

        const keyCode = KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd] });
        expect(keyCode).to.be.deep.equal(KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd] }));
        expect(keyCode.isModifierOnly()).to.be.true;
    });

    it("it should be multiple modifiers only", () => {

        const keyCode = KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd, KeyModifier.Alt] });
        expect(keyCode).to.be.deep.equal(KeyCode.createKeyCode({ modifiers: [KeyModifier.CtrlCmd, KeyModifier.Alt] }));
        expect(keyCode.isModifierOnly()).to.be.true;
    });
});

const TEST_COMMAND: Command = {
    id: 'test.command'
};

const TEST_COMMAND2: Command = {
    id: 'test.command2'
};

const TEST_COMMAND_SHADOW: Command = {
    id: 'test.command-shadow'
};

@injectable()
export class TestContribution implements CommandContribution, KeybindingContribution {

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TEST_COMMAND);
        commands.registerCommand(TEST_COMMAND2);
        commands.registerCommand(TEST_COMMAND_SHADOW);
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        [{
            command: TEST_COMMAND.id,
            context: 'testContext',
            keybinding: 'ctrl+a'
        },
        {
            command: TEST_COMMAND2.id,
            context: 'testContext',
            keybinding: 'ctrl+f1'
        },
        {
            command: TEST_COMMAND2.id,
            context: 'testContext',
            keybinding: 'ctrl+f2'
        },
        ].forEach(binding => {
            keybindings.registerKeybinding(binding);
        });
    }

}
