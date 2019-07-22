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
import { KeyboardLayoutProvider, NativeKeyboardLayout, KeyboardLayoutChangeNotifier } from '../common/keyboard/keyboard-layout-provider';
import { ILogger } from '../common/logger';
import { KeybindingRegistry, KeybindingContext, Keybinding, KeybindingContribution, KeybindingScope } from './keybinding';
import { KeyCode, Key, KeyModifier, KeySequence } from './keyboard/keys';
import { KeyboardLayoutService } from './keyboard/keyboard-layout-service';
import { CommandRegistry, CommandService, CommandContribution, Command } from '../common/command';
import { LabelParser } from './label-parser';
import { MockLogger } from '../common/test/mock-logger';
import { StatusBar, StatusBarImpl } from './status-bar/status-bar';
import { FrontendApplicationStateService } from './frontend-application-state';
import { ContextKeyService } from './context-key-service';
import * as os from '../common/os';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { Emitter } from '../common/event';

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

        bind(KeyboardLayoutService).toSelf().inSingletonScope();
        bind(MockKeyboardLayoutProvider).toSelf().inSingletonScope();
        bind(KeyboardLayoutProvider).toService(MockKeyboardLayoutProvider);
        bind(MockKeyboardLayoutChangeNotifier).toSelf().inSingletonScope();
        bind(KeyboardLayoutChangeNotifier).toService(MockKeyboardLayoutChangeNotifier);

        bindContributionProvider(bind, KeybindingContext);

        bind(CommandRegistry).toSelf().inSingletonScope();
        bindContributionProvider(bind, CommandContribution);

        bind(KeybindingRegistry).toSelf();
        bindContributionProvider(bind, KeybindingContribution);

        bind(TestContribution).toSelf().inSingletonScope();
        [CommandContribution, KeybindingContribution].forEach(serviceIdentifier =>
            bind(serviceIdentifier).toService(TestContribution)
        );

        bind(KeybindingContext).toConstantValue({
            id: 'testContext',
            isEnabled(arg?: Keybinding): boolean {
                return true;
            }
        });

        bind(StatusBarImpl).toSelf().inSingletonScope();
        bind(StatusBar).toService(StatusBarImpl);
        bind(CommandService).toService(CommandRegistry);
        bind(LabelParser).toSelf().inSingletonScope();
        bind(ContextKeyService).toSelf().inSingletonScope();
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

    beforeEach(async () => {
        stub = sinon.stub(os, 'isOSX').value(false);
        keybindingRegistry = testContainer.get<KeybindingRegistry>(KeybindingRegistry);
        await keybindingRegistry.onStart();
    });

    afterEach(() => {
        stub.restore();
    });

    it('should register the default keybindings', () => {
        const keybinding = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);
        expect(keybinding).is.not.undefined;

        const keybinding2 = keybindingRegistry.getKeybindingsForCommand('undefined.command');
        expect(keybinding2.length).is.equal(0);
    });

    it('should set a keymap', () => {
        const keybindings: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: 'ctrl+c'
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);
        if (bindings) {
            const keyCode = KeyCode.parse(bindings[0].keybinding);
            expect(keyCode.key).to.be.equal(Key.KEY_C);
            expect(keyCode.ctrl).to.be.true;
        }

    });

    it('should reset to default in case of invalid keybinding', () => {
        const keybindings: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: 'ctrl+invalid'
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id);
        if (bindings) {
            const keyCode = KeyCode.parse(bindings[0].keybinding);
            expect(keyCode.key).to.be.equal(Key.KEY_A);
            expect(keyCode.ctrl).to.be.true;
        }
    });

    it('should remove all keybindings from a command that has multiple keybindings', () => {
        const keybindings: Keybinding[] = [{
            command: TEST_COMMAND2.id,
            keybinding: 'F3'
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND2.id);
        if (bindings) {
            expect(bindings.length).to.be.equal(1);
            const keyCode = KeyCode.parse(bindings[0].keybinding);
            expect(keyCode.key).to.be.equal(Key.F3);
            expect(keyCode.ctrl).to.be.false;
        }
    });

    it('should register a correct keybinding, then default back to the original for a wrong one after', () => {
        let keybindings: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: 'ctrl+c'
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
            keybinding: 'ControlLeft+Invalid'
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

    it('should only return the more specific keybindings when a keystroke is entered', () => {
        const keybindingsUser: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: 'ctrl+b'
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindingsUser);

        const keybindingsSpecific: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: 'ctrl+c'
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

    it('should return partial keybinding matches', () => {
        const keybindingsUser: Keybinding[] = [{
            command: TEST_COMMAND.id,
            keybinding: 'ctrlcmd+x t'
        }];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindingsUser);

        const validKeyCodes = [];
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd] }));
        validKeyCodes.push(KeyCode.createKeyCode({ first: Key.KEY_T }));

        const bindings = keybindingRegistry.getKeybindingsForKeySequence(KeySequence.parse('ctrlcmd+x'));
        expect(bindings.partial.length > 0);
    });

    it('should not register a shadowing keybinding', () => {
        const validKeyBinding = 'ctrlcmd+b a';
        const command = TEST_COMMAND_SHADOW.id;
        const keybindingShadowing: Keybinding[] = [
            {
                command,
                keybinding: validKeyBinding
            },
            {
                command,
                keybinding: 'ctrlcmd+b'
            }
        ];

        keybindingRegistry.registerKeybindings(...keybindingShadowing);

        const bindings = keybindingRegistry.getKeybindingsForCommand(command);
        expect(bindings.length).to.be.equal(1);
        expect(bindings[0].keybinding).to.be.equal(validKeyBinding);
    });

    it('shadowed bindings should not be returned', () => {
        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift] });
        let bindings: Keybinding[];

        const ignoredDefaultBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.ignored-command'
        };

        const defaultBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.workspace-command'
        };

        const userBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.workspace-command'
        };

        const workspaceBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.workspace-command'
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
class MockKeyboardLayoutProvider implements KeyboardLayoutProvider {
    getNativeLayout(): Promise<NativeKeyboardLayout> {
        return Promise.resolve({
            info: { id: 'mock', lang: 'en' },
            mapping: {}
        });
    }
}

@injectable()
class MockKeyboardLayoutChangeNotifier implements KeyboardLayoutChangeNotifier {
    private emitter = new Emitter<NativeKeyboardLayout>();
    get onDidChangeNativeLayout() {
        return this.emitter.event;
    }
}

@injectable()
class TestContribution implements CommandContribution, KeybindingContribution {

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
