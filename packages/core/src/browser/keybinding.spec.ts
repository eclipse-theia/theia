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
import { KeybindingRegistry, KeybindingContext, KeybindingContribution, KeybindingScope } from './keybinding';
import { Keybinding } from '../common/keybinding';
import { KeyCode, Key, KeyModifier, KeySequence } from './keyboard/keys';
import { KeyboardLayoutService } from './keyboard/keyboard-layout-service';
import { CommandRegistry, CommandService, CommandContribution, Command } from '../common/command';
import { LabelParser } from './label-parser';
import { MockLogger } from '../common/test/mock-logger';
import { StatusBar, StatusBarImpl } from './status-bar/status-bar';
import { FrontendApplicationStateService } from './frontend-application-state';
import { ContextKeyService, ContextKeyServiceDummyImpl } from './context-key-service';
import { CorePreferences } from './core-preferences';
import * as os from '../common/os';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { Emitter, Event } from '../common/event';
import { bindPreferenceService } from './frontend-application-bindings';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';
import { ApplicationProps } from '@theia/application-package/lib/';

disableJSDOM();

/* eslint-disable no-unused-expressions */

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
        bind(ContextKeyService).to(ContextKeyServiceDummyImpl).inSingletonScope();
        bind(FrontendApplicationStateService).toSelf().inSingletonScope();
        bind(CorePreferences).toConstantValue(<CorePreferences>{});
        bindPreferenceService(bind);
    });

    testContainer.load(module);

    commandRegistry = testContainer.get(CommandRegistry);
    commandRegistry.onStart();

});

describe('keybindings', () => {

    let stub: sinon.SinonStub;

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({
            ...ApplicationProps.DEFAULT.frontend.config,
            'applicationName': 'test'
        });
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

    it('should register a keybinding', () => {
        const keybinding: Keybinding = {
            command: TEST_COMMAND2.id,
            keybinding: 'F5'
        };
        expect(isKeyBindingRegistered(keybinding)).to.be.false;

        keybindingRegistry.registerKeybinding(keybinding);

        expect(isKeyBindingRegistered(keybinding)).to.be.true;
    }
    );

    it('should unregister all keybindings from a specific command', () => {
        const otherKeybinding: Keybinding = {
            command: TEST_COMMAND.id,
            keybinding: 'F4'
        };
        keybindingRegistry.registerKeybinding(otherKeybinding);
        expect(isKeyBindingRegistered(otherKeybinding)).to.be.true;

        const keybinding: Keybinding = {
            command: TEST_COMMAND2.id,
            keybinding: 'F5'
        };
        const keybinding2: Keybinding = {
            command: TEST_COMMAND2.id,
            keybinding: 'F6'
        };

        keybindingRegistry.registerKeybinding(keybinding);
        keybindingRegistry.registerKeybinding(keybinding2);
        expect(isKeyBindingRegistered(keybinding)).to.be.true;
        expect(isKeyBindingRegistered(keybinding2)).to.be.true;

        keybindingRegistry.unregisterKeybinding(TEST_COMMAND2);

        expect(isKeyBindingRegistered(keybinding)).to.be.false;
        expect(isKeyBindingRegistered(keybinding2)).to.be.false;
        const bindingsAfterUnregister = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND2.id);
        expect(bindingsAfterUnregister).not.to.be.undefined;
        expect(bindingsAfterUnregister.length).to.be.equal(0);
        expect(isKeyBindingRegistered(otherKeybinding)).to.be.true;
    });

    it('should unregister a specific keybinding', () => {
        const otherKeybinding: Keybinding = {
            command: TEST_COMMAND2.id,
            keybinding: 'F4'
        };

        keybindingRegistry.registerKeybinding(otherKeybinding);
        const keybinding: Keybinding = {
            command: TEST_COMMAND2.id,
            keybinding: 'F5'
        };

        keybindingRegistry.registerKeybinding(keybinding);

        expect(isKeyBindingRegistered(otherKeybinding)).to.be.true;
        expect(isKeyBindingRegistered(keybinding)).to.be.true;

        keybindingRegistry.unregisterKeybinding(keybinding);

        expect(isKeyBindingRegistered(keybinding)).to.be.false;
        expect(isKeyBindingRegistered(otherKeybinding)).to.be.true;
    }
    );

    it('should unregister a specific key', () => {
        const otherKeybinding: Keybinding = {
            command: TEST_COMMAND.id,
            keybinding: 'F4'
        };

        keybindingRegistry.registerKeybinding(otherKeybinding);
        const testKey = 'F5';
        const keybinding: Keybinding = {
            command: TEST_COMMAND2.id,
            keybinding: testKey
        };

        const keybinding2: Keybinding = {
            command: TEST_COMMAND.id,
            keybinding: testKey
        };

        keybindingRegistry.registerKeybinding(keybinding);
        keybindingRegistry.registerKeybinding(keybinding2);

        expect(isKeyBindingRegistered(otherKeybinding)).to.be.true;
        expect(isKeyBindingRegistered(keybinding)).to.be.true;
        expect(isKeyBindingRegistered(keybinding2)).to.be.true;

        keybindingRegistry.unregisterKeybinding(testKey);

        expect(isKeyBindingRegistered(otherKeybinding)).to.be.true;
        expect(isKeyBindingRegistered(keybinding)).to.be.false;
        expect(isKeyBindingRegistered(keybinding2)).to.be.false;
    }
    );

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

        let match = keybindingRegistry.matchKeybinding([KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })]);
        expect(match && match.kind).to.be.equal('full');

        match = keybindingRegistry.matchKeybinding([KeyCode.createKeyCode({ first: Key.KEY_B, modifiers: [KeyModifier.CtrlCmd] })]);
        expect(match && match.kind).to.be.equal('full');

        match = keybindingRegistry.matchKeybinding([KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd] })]);
        const keyCode = match && KeyCode.parse(match.binding.keybinding);
        expect(keyCode?.key).to.be.equal(validKeyCode.key);
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

        const match = keybindingRegistry.matchKeybinding(KeySequence.parse('ctrlcmd+x'));
        expect(match && match.kind).to.be.equal('partial');
    });

    it('should possible to override keybinding', () => {
        const overriddenKeybinding = 'ctrlcmd+b a';
        const command = TEST_COMMAND_SHADOW.id;
        const keybindingShadowing: Keybinding[] = [
            {
                command,
                keybinding: overriddenKeybinding
            },
            {
                command,
                keybinding: 'ctrlcmd+b'
            }
        ];

        keybindingRegistry.registerKeybindings(...keybindingShadowing);

        const bindings = keybindingRegistry.getKeybindingsForCommand(command);
        expect(bindings.length).to.be.equal(2);
        expect(bindings[0].keybinding).to.be.equal('ctrlcmd+b');
        expect(bindings[1].keybinding).to.be.equal(overriddenKeybinding);
    });

    it('overridden bindings should be returned last', () => {
        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift] });

        const overriddenDefaultBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.overridden-default-command'
        };

        const defaultBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.default-command'
        };

        const userBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.user-command'
        };

        const workspaceBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.workspace-command'
        };

        keybindingRegistry.setKeymap(KeybindingScope.DEFAULT, [overriddenDefaultBinding, defaultBinding]);
        keybindingRegistry.setKeymap(KeybindingScope.USER, [userBinding]);
        keybindingRegistry.setKeymap(KeybindingScope.WORKSPACE, [workspaceBinding]);
        // now WORKSPACE bindings are overriding the other scopes

        let match = keybindingRegistry.matchKeybinding([keyCode]);
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(workspaceBinding.command);

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.WORKSPACE);
        // now it should find USER bindings

        match = keybindingRegistry.matchKeybinding([keyCode]);
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(userBinding.command);

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.USER);
        // and finally it should fallback to DEFAULT bindings.

        match = keybindingRegistry.matchKeybinding([keyCode]);
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(defaultBinding.command);

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.DEFAULT);
        // now the registry should be empty

        match = keybindingRegistry.matchKeybinding([keyCode]);
        expect(match).to.be.undefined;

    });

    it('should not match disabled keybindings', () => {
        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift] });

        const defaultBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.workspace-command'
        };
        const disableDefaultBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: '-test.workspace-command'
        };

        keybindingRegistry.setKeymap(KeybindingScope.DEFAULT, [defaultBinding]);
        let match = keybindingRegistry.matchKeybinding([keyCode]);
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(defaultBinding.command);

        keybindingRegistry.setKeymap(KeybindingScope.USER, [disableDefaultBinding]);
        match = keybindingRegistry.matchKeybinding([keyCode]);
        expect(match).to.be.undefined;

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.USER);
        match = keybindingRegistry.matchKeybinding([keyCode]);
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(defaultBinding.command);
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
    get onDidChangeNativeLayout(): Event<NativeKeyboardLayout> {
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

function isKeyBindingRegistered(keybinding: Keybinding): boolean {
    const bindings = keybindingRegistry.getKeybindingsForCommand(keybinding.command);
    expect(bindings).not.to.be.undefined;
    let keyBindingFound = false;
    bindings.forEach(
        (value: Keybinding) => {
            if (value.command === keybinding.command && value.keybinding === keybinding.keybinding) {
                keyBindingFound = true;
            }
        }
    );
    return keyBindingFound;
}
