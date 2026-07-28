// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from './test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { Container, injectable, ContainerModule } from 'inversify';
import { bindContributionProvider } from '../common/contribution-provider';
import { KeyboardLayoutProvider, KeyboardLayoutSourceProvider, NativeKeyboardLayout, KeyboardLayoutChangeNotifier } from '../common/keyboard/keyboard-layout-provider';
import { ILogger } from '../common/logger';
import { KeybindingRegistry, KeybindingContext, KeybindingContribution, KeybindingScope } from './keybinding';
import { Keybinding } from '../common/keybinding';
import { KeyCode, Key, KeyModifier, KeySequence } from './keyboard/keys';
import { KeyboardLayoutService } from './keyboard/keyboard-layout-service';
import { CommandRegistry, CommandService, CommandContribution, Command } from '../common/command';
import { LabelParser } from './label-parser';
import { MockLogger } from '../common/test/mock-logger';
import { FrontendApplicationStateService } from './frontend-application-state';
import { ContextKeyService, ContextKeyServiceDummyImpl, ContextMatcher } from './context-key-service';
import { CorePreferences } from '../common/core-preferences';
import * as os from '../common/os';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { Emitter, Event } from '../common/event';
import { bindPreferenceService } from './frontend-application-bindings';
import { MarkdownRenderer, MarkdownRendererFactory, MarkdownRendererImpl } from './markdown-rendering/markdown-renderer';
import { StatusBar } from './status-bar';

disableJSDOM();

const expect = chai.expect;

let keybindingRegistry: KeybindingRegistry;
let commandRegistry: CommandRegistry;
let testContainer: Container;

let stub: sinon.SinonStub;
const preferenceChanged = new Emitter<{ preferenceName: string }>();
const corePreferences = <CorePreferences><unknown>{
    'keyboard.dispatch': 'code',
    onPreferenceChanged: preferenceChanged.event
};

before(async () => {
    disableJSDOM = enableJSDOM();

    testContainer = new Container();
    const module = new ContainerModule((bind, unbind, isBound, rebind) => {

        /* Mock logger binding*/
        bind(ILogger).to(MockLogger);

        bind(KeyboardLayoutService).toSelf().inSingletonScope();
        bind(MockKeyboardLayoutProvider).toSelf().inSingletonScope();
        bind(KeyboardLayoutProvider).toDynamicValue(ctx => {
            const provider = ctx.container.get(MockKeyboardLayoutProvider);
            return new Proxy(provider, {
                get: (target, property) => property === 'then' ? undefined : property in target ? Reflect.get(target, property) : () => undefined
            });
        });
        bind(KeyboardLayoutSourceProvider).toConstantValue({ layoutSource: 'navigator.keyboard' });
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

        bind(StatusBar).toConstantValue({
            setElement: () => Promise.resolve(),
            removeElement: () => Promise.resolve()
        } as unknown as StatusBar);
        bind(MarkdownRendererImpl).toSelf().inSingletonScope();
        bind(MarkdownRenderer).toService(MarkdownRendererImpl);
        bind(MarkdownRendererFactory).toFactory(({ container }) => () => container.get(MarkdownRenderer));

        bind(CommandService).toService(CommandRegistry);
        bind(LabelParser).toSelf().inSingletonScope();
        bind(ContextKeyService).to(MockContextKeyService).inSingletonScope();
        bind(FrontendApplicationStateService).toSelf().inSingletonScope();
        bind(CorePreferences).toConstantValue(corePreferences);
        bindPreferenceService(bind);
    });

    testContainer.load(module);

    commandRegistry = testContainer.get(CommandRegistry);
    commandRegistry.onStart();

});

after(() => {
    disableJSDOM();
});

beforeEach(async () => {
    stub = sinon.stub(os, 'isOSX').value(false);
    keybindingRegistry = testContainer.get<KeybindingRegistry>(KeybindingRegistry);
    (corePreferences as unknown as Record<string, unknown>)['keyboard.dispatch'] = 'code';
    await keybindingRegistry.onStart();
});

afterEach(() => {
    stub.restore();
});

describe('keybindings', () => {

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

    it('should remove all disabled keybindings from a command that has multiple keybindings', () => {
        const keybindings: Keybinding[] = [{
            command: TEST_COMMAND2.id,
            keybinding: 'F3'
        },
        {
            command: '-' + TEST_COMMAND2.id,
            context: 'testContext',
            keybinding: 'ctrl+f1'
        },
        ];

        keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);

        const bindings = keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND2.id);
        if (bindings) {
            // a USER one and a DEFAULT one
            expect(bindings.length).to.be.equal(2);
            const keyCode = KeyCode.parse(bindings[0].keybinding);
            expect(keyCode.key).to.be.equal(Key.F3);
            expect(keyCode.ctrl).to.be.false;
            const keyCode2 = KeyCode.parse(bindings[1].keybinding);
            expect(keyCode2.key).to.be.equal(Key.F2);
            expect(keyCode2.ctrl).to.be.true;
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

        let match = keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(workspaceBinding));
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(workspaceBinding.command);

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.WORKSPACE);
        // now it should find USER bindings

        match = keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(userBinding));
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(userBinding.command);

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.USER);
        // and finally it should fallback to DEFAULT bindings.

        match = keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(defaultBinding));
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
        let match = keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(defaultBinding));
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(defaultBinding.command);

        keybindingRegistry.setKeymap(KeybindingScope.USER, [disableDefaultBinding]);
        match = keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(defaultBinding));
        expect(match).to.be.undefined;

        keybindingRegistry.resetKeybindingsForScope(KeybindingScope.USER);
        match = keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(defaultBinding));
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal(defaultBinding.command);
    });

    it('should dispatch pre-cancelled compatibility events to capture listeners', () => {
        const target = document.createElement('iframe');
        document.body.appendChild(target);
        const captured = sinon.spy();
        document.addEventListener('keydown', captured, true);
        const match = sinon.spy(keybindingRegistry, 'matchKeybinding');

        keybindingRegistry.dispatchKeyDown({ key: 'a', code: 'KeyA' }, target, true);

        expect(captured.calledOnce).to.be.true;
        expect(captured.firstCall.args[0].defaultPrevented).to.be.true;
        expect(match.called).to.be.false;
        document.removeEventListener('keydown', captured, true);
        target.remove();
    });

    it('should dispatch normalized keyboard data directly', () => {
        const match = sinon.spy(keybindingRegistry, 'matchKeybinding');

        keybindingRegistry.dispatchNormalizedKeyDown({
            key: 'a',
            code: 'KeyA',
            keyCode: 65,
            ctrlKey: true
        }, new EventTarget());

        expect(match.calledOnce).to.be.true;
        expect(match.firstCall.args[0][0].dispatchString()).to.equal('ctrl+a');
    });

    it('should dispatch commands through normalized production data', async () => {
        testContainer.get(MockKeyboardLayoutChangeNotifier).emitter.fire(require('../../src/common/keyboard/layouts/de-German-pc.json'));
        const binding = { command: TEST_COMMAND_SHADOW.id, keybinding: 'ctrl+[' };
        keybindingRegistry.setKeymap(KeybindingScope.USER, [binding]);
        const execute = sinon.spy();
        const handler = commandRegistry.registerHandler(TEST_COMMAND_SHADOW.id, { execute });
        const dispatch = sinon.spy(keybindingRegistry, 'dispatchNormalizedKeyDown');
        const target = new EventTarget();

        keybindingRegistry.dispatchCommand(TEST_COMMAND_SHADOW.id, target);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(dispatch.calledOnce).to.be.true;
        expect(dispatch.firstCall.args[0]).to.include({
            key: '[',
            code: 'Digit8',
            keyCode: 56,
            ctrlKey: true,
            altGraph: true
        });
        expect(execute.calledOnce).to.be.true;
        handler.dispose();
    });

    it('should interpret native and transported AltGraph input identically', () => {
        testContainer.get(MockKeyboardLayoutChangeNotifier).emitter.fire(require('../../src/common/keyboard/layouts/de-German-pc.json'));
        const native = keybindingRegistry.getKeyCodeInterpretations({
            key: '[',
            code: 'Digit8',
            keyCode: 56,
            ctrlKey: true,
            getModifierState: modifier => modifier === 'AltGraph'
        });
        const transported = keybindingRegistry.getKeyCodeInterpretations({
            key: '[',
            code: 'Digit8',
            keyCode: 56,
            ctrlKey: true,
            altGraph: true
        });

        expect(transported.map(code => code.dispatchString())).to.deep.equal(native.map(code => code.dispatchString()));
    });

    it('should log normalized keyboard troubleshooting data when enabled', () => {
        const logger = (keybindingRegistry as unknown as { logger: ILogger }).logger;
        const info = sinon.spy(logger, 'info');
        keybindingRegistry.toggleKeyboardShortcutsTroubleshooting();

        keybindingRegistry.dispatchNormalizedKeyDown({
            key: '[',
            code: 'Digit8',
            keyCode: 56,
            getModifierState: modifier => modifier === 'AltGraph',
            timeStamp: 42
        }, new EventTarget());

        expect(info.calledTwice).to.be.true;
        expect(info.secondCall.args[1].input).to.include({
            key: '[',
            code: 'Digit8',
            altGraph: true,
            timeStamp: 42
        });
        expect(info.secondCall.args[1].layout.source).to.equal('navigator.keyboard');
    });

    it('should skip composing normalized keyboard data', () => {
        const match = sinon.spy(keybindingRegistry, 'matchKeybinding');

        keybindingRegistry.dispatchNormalizedKeyDown({
            key: 'a',
            code: 'KeyA',
            keyCode: 65,
            isComposing: true
        }, new EventTarget());

        expect(match.called).to.be.false;
    });

    it('should exclude inactive bindings and reactivate them after a layout change', () => {
        const binding = { command: TEST_COMMAND.id, keybinding: 'ctrl+[' };
        keybindingRegistry.setKeymap(KeybindingScope.USER, [binding]);
        expect(keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(binding))?.kind).to.equal('full');

        const notifier = testContainer.get(MockKeyboardLayoutChangeNotifier);
        notifier.emitter.fire({
            info: { id: 'missing-bracket', lang: 'en' },
            mapping: { KeyA: { value: 'a', withShift: 'A', withAltGr: '', withShiftAltGr: '' } }
        });
        expect(keybindingRegistry.getKeybindingsForCommand(TEST_COMMAND.id).some(candidate => candidate.keybinding === 'ctrl+[')).to.be.true;
        expect(keybindingRegistry.getKeybindingInactiveReason(binding)).to.be.a('string');
        expect(keybindingRegistry.matchKeybinding(KeySequence.parse('ctrl+['))).to.be.undefined;
        expect(keybindingRegistry.containsKeybindingInScope({ command: TEST_COMMAND2.id, keybinding: 'ctrl+[' })).to.be.false;

        notifier.emitter.fire(require('../../src/common/keyboard/layouts/en-US-pc.json'));
        expect(keybindingRegistry.getKeybindingInactiveReason(binding)).to.be.undefined;
        expect(keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(binding))?.kind).to.equal('full');
    });

    it('should route Windows command and production candidates through the registry', () => {
        const windows = sinon.stub(os, 'isWindows').value(true);
        try {
            testContainer.get(MockKeyboardLayoutChangeNotifier).emitter.fire(require('../../src/common/keyboard/layouts/de-German-pc.json'));
            const match = sinon.spy(keybindingRegistry, 'matchKeybinding');
            const logicalBinding = {
                command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
                keybinding: 'ctrl+[',
                resolved: [new KeyCode({ key: Key.DIGIT8, ctrl: true, character: '[', production: { altGraph: true } })]
            };
            keybindingRegistry.setKeymap(KeybindingScope.USER, [logicalBinding]);

            keybindingRegistry.dispatchNormalizedKeyDown({
                key: '[', code: 'Digit8', ctrlKey: true, altKey: true, altGraph: false
            }, new EventTarget());

            expect(match.callCount).to.equal(2);
            expect(match.secondCall.returnValue?.kind).to.equal('full');
            expect(match.secondCall.returnValue?.binding.keybinding).to.equal('ctrl+[');

            match.resetHistory();
            keybindingRegistry.setKeymap(KeybindingScope.USER, [
                logicalBinding,
                { command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND, keybinding: 'ctrl+alt+8' }
            ]);
            keybindingRegistry.dispatchNormalizedKeyDown({
                key: '[', code: 'Digit8', ctrlKey: true, altKey: true, altGraph: false
            }, new EventTarget());

            expect(match.callCount).to.equal(2);
            expect(match.firstCall.returnValue?.binding.keybinding).to.equal('ctrl+alt+8');
        } finally {
            windows.restore();
        }
    });

    it('should prefer a command chord prefix over a production full match', () => {
        const interpretations = sinon.stub(keybindingRegistry, 'getKeyCodeInterpretations').returns([
            new KeyCode({ key: Key.KEY_A, ctrl: true, interpretation: 'command' }),
            new KeyCode({ key: Key.DIGIT8, ctrl: true, production: { altGraph: true }, interpretation: 'production' })
        ]);
        const commandChord = {
            command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
            keybinding: 'ctrl+a b'
        };
        const productionFull = {
            command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
            keybinding: 'ctrl+['
        };
        keybindingRegistry.resolveKeybinding(commandChord).splice(0, 2, ...KeySequence.parse('ctrl+a b'));
        keybindingRegistry.resolveKeybinding(productionFull).splice(0, 1,
            new KeyCode({ key: Key.DIGIT8, ctrl: true, character: '[', production: { altGraph: true } }));
        keybindingRegistry.setKeymap(KeybindingScope.USER, [commandChord, productionFull]);

        const event = new KeyboardEvent('keydown', { key: '[', code: 'Digit8', cancelable: true });
        keybindingRegistry.run(event);

        expect(event.defaultPrevented).to.be.true;
        expect((keybindingRegistry as unknown as { keySequenceCandidates: KeySequence[] }).keySequenceCandidates).to.have.length(1);
        expect((keybindingRegistry as unknown as { keySequenceCandidates: KeySequence[] }).keySequenceCandidates[0][0].interpretation).to.equal('command');
        interpretations.restore();
    });

    it('should retain alternative interpretation prefixes across a chord', () => {
        const commandPrefix = new KeyCode({ key: Key.KEY_A, ctrl: true, interpretation: 'command' });
        const productionPrefix = new KeyCode({ key: Key.DIGIT8, ctrl: true, production: { altGraph: true }, interpretation: 'production' });
        const productionSecond = new KeyCode({ key: Key.KEY_C, interpretation: 'production' });
        const interpretations = sinon.stub(keybindingRegistry, 'getKeyCodeInterpretations');
        interpretations.onFirstCall().returns([commandPrefix, productionPrefix]);
        interpretations.onSecondCall().returns([
            new KeyCode({ key: Key.KEY_X, interpretation: 'command' }),
            productionSecond
        ]);
        const commandBinding = {
            command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
            keybinding: 'ctrl+a b'
        };
        const productionBinding = {
            command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
            keybinding: 'ctrl+[ c'
        };
        keybindingRegistry.resolveKeybinding(commandBinding).splice(0, 2, commandPrefix, new KeyCode({ key: Key.KEY_B }));
        keybindingRegistry.resolveKeybinding(productionBinding).splice(0, 2, productionPrefix, productionSecond);
        keybindingRegistry.setKeymap(KeybindingScope.USER, [commandBinding, productionBinding]);

        keybindingRegistry.run(new KeyboardEvent('keydown', { key: '[', code: 'Digit8', cancelable: true }));
        expect((keybindingRegistry as unknown as { keySequenceCandidates: KeySequence[] }).keySequenceCandidates).to.have.length(2);
        const second = new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', cancelable: true });
        keybindingRegistry.run(second);

        expect(second.defaultPrevented).to.be.false;
        expect((keybindingRegistry as unknown as { keySequenceCandidates: KeySequence[] }).keySequenceCandidates).to.deep.equal([[]]);
        interpretations.restore();
    });

    it('should decline equal-priority full matches from different interpretations', () => {
        const first = new KeyCode({ key: Key.KEY_A, ctrl: true, interpretation: 'command' });
        const second = new KeyCode({ key: Key.KEY_B, ctrl: true, interpretation: 'command' });
        const interpretations = sinon.stub(keybindingRegistry, 'getKeyCodeInterpretations').returns([first, second]);
        const troubleshooting = sinon.spy(keybindingRegistry as unknown as {
            logKeyboardTroubleshooting: (input: unknown, keyCode: KeyCode, match: unknown, skipped?: string) => void
        }, 'logKeyboardTroubleshooting');
        const firstBinding = { command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND, keybinding: 'ctrl+a' };
        const secondBinding = { command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND, keybinding: 'ctrl+b' };
        keybindingRegistry.resolveKeybinding(firstBinding).splice(0, 1, first);
        keybindingRegistry.resolveKeybinding(secondBinding).splice(0, 1, second);
        keybindingRegistry.setKeymap(KeybindingScope.USER, [firstBinding, secondBinding]);

        keybindingRegistry.run(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));

        expect(troubleshooting.lastCall.args[3]).to.equal('ambiguous');
        expect(troubleshooting.lastCall.args[2]).to.be.undefined;
        interpretations.restore();
    });

    it('should canonicalize production input for recorder persistence', () => {
        const interpretations = sinon.stub(keybindingRegistry, 'getKeyCodeInterpretations').returns([
            new KeyCode({ key: Key.DIGIT8, ctrl: true, alt: true, interpretation: 'command' }),
            new KeyCode({ key: Key.DIGIT8, ctrl: true, character: '[', production: { altGraph: true }, interpretation: 'production' })
        ]);

        expect(keybindingRegistry.canonicalKeyCodeForKeyboardInput({ key: '[', code: 'Digit8' })?.toString()).to.equal('ctrl+[');
        interpretations.restore();
    });

    it('should retain command Shift when production Shift is not the logical binding', () => {
        const interpretations = sinon.stub(keybindingRegistry, 'getKeyCodeInterpretations').returns([
            new KeyCode({ key: Key.KEY_P, ctrl: true, character: 'P', production: { shift: true }, interpretation: 'production' })
        ]);

        expect(keybindingRegistry.canonicalKeyCodeForKeyboardInput({ key: 'P', code: 'KeyP' })?.toString()).to.equal('shift+ctrl+p');
        interpretations.restore();
    });

    it('should persist a parseable logical character produced by Shift', () => {
        const interpretations = sinon.stub(keybindingRegistry, 'getKeyCodeInterpretations').returns([
            new KeyCode({ key: Key.DIGIT7, character: '/', production: { shift: true }, interpretation: 'production' })
        ]);
        const resolve = sinon.stub(testContainer.get(KeyboardLayoutService), 'resolveKeyCode').callsFake(code => code.key === Key.SLASH
            ? new KeyCode({ key: Key.DIGIT7, character: '/', production: { shift: true } })
            : code);

        expect(keybindingRegistry.canonicalKeyCodeForKeyboardInput({ key: '/', code: 'Digit7' })?.toString()).to.equal('/');
        resolve.restore();
        interpretations.restore();
    });

    it('should retain physical Shift when the produced character is not authorable', () => {
        const production = new KeyCode({ key: Key.SLASH, ctrl: true, character: '?', production: { shift: true }, interpretation: 'production' });
        const interpretations = sinon.stub(keybindingRegistry, 'getKeyCodeInterpretations').returns([production]);

        const recorded = keybindingRegistry.canonicalKeyCodeForKeyboardInput({ key: '?', code: 'Slash' });
        expect(recorded?.toString()).to.equal('shift+ctrl+/');
        expect(keybindingRegistry.resolveKeybinding({ command: TEST_COMMAND.id, keybinding: recorded!.toString() })[0].dispatchString())
            .to.equal(production.dispatchString());
        interpretations.restore();
    });

    it('should classify interpretation shadowing separately from canonical collisions', () => {
        const logical = {
            command: TEST_COMMAND.id,
            keybinding: 'ctrl+[',
            resolved: [new KeyCode({ key: Key.DIGIT8, ctrl: true, character: '[', production: { altGraph: true } })]
        };
        const command = { command: TEST_COMMAND2.id, keybinding: 'ctrl+alt+8' };
        keybindingRegistry.setKeymap(KeybindingScope.USER, [logical, command]);

        const diagnostics = keybindingRegistry.getKeybindingCollisionDiagnostics(logical);
        expect(diagnostics.interpretationShadowing.map(binding => binding.command)).to.include(TEST_COMMAND2.id);
        expect(diagnostics.canonical.full).to.be.empty;
        expect(diagnostics.layoutDerived.full).to.be.empty;
        expect(keybindingRegistry.containsKeybindingInScope(logical)).to.be.false;
    });

    it('should keep shifted printable bindings symmetric in keyCode dispatch mode', () => {
        (corePreferences as unknown as Record<string, unknown>)['keyboard.dispatch'] = 'keyCode';
        const commandPalette = { command: TEST_COMMAND.id, keybinding: 'ctrl+shift+p' };
        const shiftedPrintable = { command: TEST_COMMAND2.id, keybinding: 'shift+/' };
        keybindingRegistry.setKeymap(KeybindingScope.USER, [commandPalette, shiftedPrintable]);

        expect(keybindingRegistry.matchKeybinding(KeySequence.parse('ctrl+shift+p'))?.binding.command).to.equal(TEST_COMMAND.id);
        expect(keybindingRegistry.matchKeybinding(KeySequence.parse('shift+/'))?.binding.command).to.equal(TEST_COMMAND2.id);
    });

    it('should invalidate resolved bindings when keyboard dispatch changes', () => {
        const binding = { command: TEST_COMMAND.id, keybinding: 'ctrl+[' };
        keybindingRegistry.setKeymap(KeybindingScope.USER, [binding]);
        expect(keybindingRegistry.getKeybindingInactiveReason(binding)).to.be.undefined;
        const changed = sinon.spy();
        keybindingRegistry.onKeybindingsChanged(changed);

        (corePreferences as unknown as Record<string, unknown>)['keyboard.dispatch'] = 'keyCode';
        preferenceChanged.fire({ preferenceName: 'keyboard.dispatch' });

        expect(changed.calledOnce).to.be.true;
        expect(keybindingRegistry.resolveKeybinding(binding)[0].dispatchString()).to.equal('ctrl+[');
        expect(keybindingRegistry.matchKeybinding(KeySequence.parse('ctrl+['))?.kind).to.equal('full');
    });

    it('should prioritize bindings that use local context keys', () => {
        // Ensure JSDOM is enabled for this test since it uses document
        const disable = enableJSDOM();

        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift] });

        // Register two commands with the same keybinding but different when clauses
        const globalBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.global-command',
            when: 'globalContextKey'
        };

        const localBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.local-command',
            when: 'localContextKey'
        };

        // Register commands with handlers so they are enabled
        commandRegistry.registerCommand({ id: 'test.global-command' }, { execute: () => { } });
        commandRegistry.registerCommand({ id: 'test.local-command' }, { execute: () => { } });

        // globalBinding is registered first, so without local context prioritization it would win
        keybindingRegistry.setKeymap(KeybindingScope.DEFAULT, [globalBinding, localBinding]);

        // Get the mock context key service
        const contextKeyService = testContainer.get<MockContextKeyService>(ContextKeyService);

        // Set up mock to return 'localContextKey' as a local key
        contextKeyService.setLocalContextKeys(new Set(['localContextKey']));

        // Both when clauses should match
        contextKeyService.setMatchResult(true);

        // Create a mock keyboard event with a target element
        const targetElement = document.createElement('div');
        const mockEvent = new KeyboardEvent('keydown', {
            key: 'A',
            shiftKey: true
        });
        Object.defineProperty(mockEvent, 'target', { value: targetElement });

        const match = keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(localBinding), mockEvent);

        // The localBinding should be selected because it uses a local context key
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal('test.local-command');

        disable();
    });

    it('should fall back to first binding when no local context keys exist', () => {
        // Ensure JSDOM is enabled for this test since it uses document
        const disable = enableJSDOM();

        const keyCode = KeyCode.createKeyCode({ first: Key.KEY_B, modifiers: [KeyModifier.Shift] });

        const firstBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.first-command',
            when: 'someContextKey'
        };

        const secondBinding: Keybinding = {
            keybinding: keyCode.toString(),
            command: 'test.second-command',
            when: 'otherContextKey'
        };

        commandRegistry.registerCommand({ id: 'test.first-command' }, { execute: () => { } });
        commandRegistry.registerCommand({ id: 'test.second-command' }, { execute: () => { } });

        // Note: bindings registered later (later in the array) have higher priority
        // because insertBindingIntoScope inserts them at the front of the scope's keymap
        keybindingRegistry.setKeymap(KeybindingScope.DEFAULT, [firstBinding, secondBinding]);

        const contextKeyService = testContainer.get<MockContextKeyService>(ContextKeyService);

        // No local context keys
        contextKeyService.setLocalContextKeys(new Set());
        contextKeyService.setMatchResult(true);

        const targetElement = document.createElement('div');
        const mockEvent = new KeyboardEvent('keydown', {
            key: 'B',
            shiftKey: true
        });
        Object.defineProperty(mockEvent, 'target', { value: targetElement });

        const match = keybindingRegistry.matchKeybinding(keybindingRegistry.resolveKeybinding(secondBinding), mockEvent);

        // Should fall back to first enabled binding in priority order (secondBinding was registered later, so it wins)
        expect(match?.kind).to.be.equal('full');
        expect(match?.binding?.command).to.be.equal('test.second-command');

        disable();
    });
});

describe('acceleratorForKeyCode', () => {

    const ctrlV = KeyCode.createKeyCode({ key: Key.KEY_V, ctrl: true });
    const metaV = KeyCode.createKeyCode({ key: Key.KEY_V, meta: true });

    it('uses ASCII names with the separator on non-macOS', () => {
        stub.value(false);
        const accelerator = keybindingRegistry.acceleratorForKeyCode(ctrlV, '+');
        expect(accelerator).to.equal('Ctrl+V');
    });

    it('uses macOS symbols without a separator on macOS browser', () => {
        stub.value(true);
        const accelerator = keybindingRegistry.acceleratorForKeyCode(metaV, '+');
        expect(accelerator).to.equal('⌘V');
    });

    it('separates logical labels from physical production realizations', () => {
        const logicalBracket = new KeyCode({
            key: Key.DIGIT8,
            ctrl: true,
            character: '[',
            production: { altGraph: true }
        });
        const logicalSlash = new KeyCode({
            key: Key.DIGIT7,
            character: '/',
            production: { shift: true }
        });

        expect(keybindingRegistry.componentsForKeyCode(logicalBracket)).to.deep.equal(['Ctrl', '[']);
        expect(keybindingRegistry.physicalComponentsForKeyCode(logicalBracket)).to.deep.equal(['Ctrl', 'AltGr', '8']);
        expect(keybindingRegistry.physicalAcceleratorForKeyCode(logicalBracket, '+', true)).to.equal('Ctrl+AltGr+8');
        expect(keybindingRegistry.componentsForKeyCode(logicalSlash)).to.deep.equal(['/']);
        expect(keybindingRegistry.physicalComponentsForKeyCode(logicalSlash)).to.deep.equal(['Shift', '7']);
        expect(keybindingRegistry.physicalAcceleratorForKeyCode(logicalSlash, '+', true)).to.equal('Shift+7');
    });

    it('keeps command Shift in physical realizations', () => {
        const commandShift = new KeyCode({ key: Key.TAB, ctrl: true, shift: true });
        expect(keybindingRegistry.physicalComponentsForKeyCode(commandShift)).to.deep.equal(['Ctrl', 'Shift', 'Tab']);
    });

    it('deduplicates command Alt and production Option on macOS', () => {
        stub.value(true);
        const commandAndProductionOption = new KeyCode({
            key: Key.DIGIT6,
            meta: true,
            ctrl: true,
            alt: true,
            production: { altGraph: true }
        });
        const productionOption = new KeyCode({ key: Key.DIGIT6, production: { altGraph: true } });

        expect(keybindingRegistry.physicalComponentsForKeyCode(commandAndProductionOption)).to.deep.equal(['⌘', '⌃', '⌥', '6']);
        expect(keybindingRegistry.physicalComponentsForKeyCode(commandAndProductionOption, true)).to.deep.equal(['Cmd', 'Ctrl', 'Alt', '6']);
        expect(keybindingRegistry.physicalComponentsForKeyCode(productionOption)).to.deep.equal(['⌥', '6']);
        expect(keybindingRegistry.physicalComponentsForKeyCode(productionOption, true)).to.deep.equal(['Option', '6']);
    });

    it('uses ASCII names with the separator on macOS Electron (asciiOnly)', () => {
        stub.value(true);
        const accelerator = keybindingRegistry.acceleratorForKeyCode(metaV, '+', true);
        expect(accelerator).to.equal('Cmd+V');
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
class MockContextKeyService extends ContextKeyServiceDummyImpl {
    private localKeys: Set<string> = new Set();
    private shouldMatch: boolean = true;
    private parsedKeys: Map<string, Set<string>> = new Map();

    constructor() {
        super();
        // Set up default parsed keys for test expressions
        this.parsedKeys.set('globalContextKey', new Set(['globalContextKey']));
        this.parsedKeys.set('localContextKey', new Set(['localContextKey']));
        this.parsedKeys.set('someContextKey', new Set(['someContextKey']));
        this.parsedKeys.set('otherContextKey', new Set(['otherContextKey']));
    }

    setLocalContextKeys(keys: Set<string>): void {
        this.localKeys = keys;
    }

    setMatchResult(result: boolean): void {
        this.shouldMatch = result;
    }

    override match(expression: string, context?: HTMLElement): boolean {
        return this.shouldMatch;
    }

    override parseKeys(expression: string): Set<string> | undefined {
        return this.parsedKeys.get(expression) || new Set([expression]);
    }

    override getLocalContextKeys(element: HTMLElement): Set<string> {
        return this.localKeys;
    }

    override createOverlay(overlay: Iterable<[string, unknown]>): ContextMatcher {
        return this;
    }
}

@injectable()
class MockKeyboardLayoutProvider implements KeyboardLayoutProvider {
    getNativeLayout(): Promise<NativeKeyboardLayout> {
        return Promise.resolve(require('../../src/common/keyboard/layouts/en-US-pc.json'));
    }
}

@injectable()
class MockKeyboardLayoutChangeNotifier implements KeyboardLayoutChangeNotifier {
    readonly emitter = new Emitter<NativeKeyboardLayout>();
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
