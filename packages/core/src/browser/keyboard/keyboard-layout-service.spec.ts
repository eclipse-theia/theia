// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { Container, injectable } from 'inversify';
import { Emitter, Event } from '../../common/event';
import { Key, KeyCode, LayoutModifiers, NormalizedKeyboardInput } from './keys';
import { KeyboardLayoutService } from './keyboard-layout-service';
import {
    KeyboardLayoutProvider, NativeKeyboardLayout, KeyboardLayoutChangeNotifier, KeyValidationInput, KeyValidator, KeyboardLayoutSource
} from '../../common/keyboard/keyboard-layout-provider';
import * as os from '../../common/os';
import * as chai from 'chai';
import * as sinon from 'sinon';

class TestKeyboardLayoutService extends KeyboardLayoutService {
    public override getWindowsKeyCodeInterpretations(keyCode: KeyCode, input: NormalizedKeyboardInput,
        layoutModifiers: LayoutModifiers | undefined): KeyCode[] {
        return super.getWindowsKeyCodeInterpretations(keyCode, input, layoutModifiers);
    }
}

describe('keyboard layout service', function (): void {

    let stubOSX: sinon.SinonStub;
    let stubWindows: sinon.SinonStub;

    const setup = async (
        layout: NativeKeyboardLayout,
        system: 'mac' | 'win' | 'linux',
        layoutSource?: KeyboardLayoutSource,
        keyValidator?: KeyValidator
    ) => {
        switch (system) {
            case 'mac':
                stubOSX = sinon.stub(os, 'isOSX').value(true);
                stubWindows = sinon.stub(os, 'isWindows').value(false);
                break;
            case 'win':
                stubOSX = sinon.stub(os, 'isOSX').value(false);
                stubWindows = sinon.stub(os, 'isWindows').value(true);
                break;
            default:
                stubOSX = sinon.stub(os, 'isOSX').value(false);
                stubWindows = sinon.stub(os, 'isWindows').value(false);
        }
        const container = new Container();
        container.bind(KeyboardLayoutService).to(TestKeyboardLayoutService).inSingletonScope();
        @injectable()
        class MockLayoutProvider implements KeyboardLayoutProvider, KeyboardLayoutChangeNotifier {
            readonly layoutSource = layoutSource;
            emitter = new Emitter<NativeKeyboardLayout>();
            get onDidChangeNativeLayout(): Event<NativeKeyboardLayout> {
                return this.emitter.event;
            }
            getNativeLayout(): Promise<NativeKeyboardLayout> {
                return Promise.resolve(layout);
            }
        }
        container.bind(KeyboardLayoutProvider).to(MockLayoutProvider);
        container.bind(KeyboardLayoutChangeNotifier).to(MockLayoutProvider);
        if (keyValidator) {
            container.bind(KeyValidator).toConstantValue(keyValidator);
        }
        const service = container.get(KeyboardLayoutService) as TestKeyboardLayoutService;
        await service.initialize();
        return service;
    };

    afterEach(() => {
        stubOSX.restore();
        stubWindows.restore();
    });

    it('reports an unknown layout source when no source provider is configured', async () => {
        const layout: NativeKeyboardLayout = { info: { id: 'mock', lang: 'en' }, mapping: {} };
        chai.expect((await setup(layout, 'linux')).layoutSource).to.equal('unknown');
    });

    it('reports the configured layout source', async () => {
        const layout: NativeKeyboardLayout = { info: { id: 'mock', lang: 'en' }, mapping: {} };
        chai.expect((await setup(layout, 'linux', 'native-keymap')).layoutSource).to.equal('native-keymap');
    });

    it('resolves correct key bindings with German Mac layout', async () => {
        const macGerman = require('../../../src/common/keyboard/layouts/de-German-mac.json');
        const service = await setup(macGerman, 'mac');

        const toggleComment = service.resolveKeyCode(KeyCode.createKeyCode('Slash+M1'));
        chai.expect(toggleComment.toString()).to.equal('meta+7');
        chai.expect(toggleComment.character).to.equal('/');
        chai.expect(toggleComment.layoutModifiers).to.deep.equal('shift');
        chai.expect(service.getKeyboardCharacter(toggleComment.key!)).to.equal('7');

        const indentLine = service.resolveKeyCode(KeyCode.createKeyCode('BracketRight+M1'));
        chai.expect(indentLine.toString()).to.equal('meta+6');
        chai.expect(indentLine.character).to.equal(']');
        chai.expect(indentLine.layoutModifiers).to.deep.equal('altGraph');
        chai.expect(service.getKeyboardCharacter(indentLine.key!)).to.equal('6');
    });

    it('resolves correct key bindings with French Mac layout', async () => {
        const macFrench = require('../../../src/common/keyboard/layouts/fr-French-mac.json');
        const service = await setup(macFrench, 'mac');

        const toggleComment = service.resolveKeyCode(KeyCode.createKeyCode('Slash+M1'));
        chai.expect(toggleComment.toString()).to.equal('meta+.');
        chai.expect(toggleComment.character).to.equal('/');
        chai.expect(toggleComment.layoutModifiers).to.deep.equal('shift');
        chai.expect(service.getKeyboardCharacter(toggleComment.key!)).to.equal(':');

        const indentLine = service.resolveKeyCode(KeyCode.createKeyCode('BracketRight+M1'));
        chai.expect(indentLine.toString()).to.equal('meta+-');
        chai.expect(indentLine.character).to.equal(']');
        chai.expect(indentLine.layoutModifiers).to.deep.equal('shiftAltGraph');
        chai.expect(service.getKeyboardCharacter(indentLine.key!)).to.equal(')');
    });

    it('uses global layout modifier priority and a stable physical-key tie-break', async () => {
        const layout: NativeKeyboardLayout = {
            info: { id: 'priority', lang: 'fr' },
            mapping: {
                Backslash: { value: '*', withShift: 'µ', withAltGr: '@', withShiftAltGr: '#' },
                IntlBackslash: { value: '@', withShift: '#', withAltGr: 'µ', withShiftAltGr: '*' },
                KeyB: { value: 'x', withShift: 'X', withAltGr: '', withShiftAltGr: '' },
                KeyA: { value: 'x', withShift: 'X', withAltGr: '', withShiftAltGr: '' }
            }
        };
        const service = await setup(layout, 'linux');

        chai.expect(service.resolveKeyCode(KeyCode.parse('shift+2')).key).to.equal(Key.INTL_BACKSLASH);
        chai.expect(service.resolveKeyCode(KeyCode.parse('x')).key).to.equal(Key.KEY_A);

        const shifted = service.resolveKeyCode(KeyCode.parse('shift+x'));
        const event = service.getKeyCodeInterpretations({ key: 'X', code: 'KeyA', shiftKey: true }, 'code')
            .find(candidate => candidate.interpretation === 'layoutModifiers')!;
        chai.expect(event.dispatchString()).to.equal(shifted.dispatchString());

        const altShifted = service.resolveKeyCode(KeyCode.parse('alt+shift+x'));
        const altEvent = service.getKeyCodeInterpretations({ key: 'X', code: 'KeyA', altKey: true, shiftKey: true }, 'code')
            .find(candidate => candidate.interpretation === 'layoutModifiers')!;
        chai.expect(altEvent.dispatchString()).to.equal(altShifted.dispatchString());

        const capsLockEvent = service.getKeyCodeInterpretations({ key: 'x', code: 'KeyA', shiftKey: true }, 'code')
            .find(candidate => candidate.interpretation === 'layoutModifiers')!;
        chai.expect(capsLockEvent.dispatchString()).to.equal(shifted.dispatchString());
    });

    it('globally ranks case-folded fallback candidates', async () => {
        const layout: NativeKeyboardLayout = {
            info: { id: 'case-folded-priority', lang: 'en' },
            mapping: {
                KeyA: { value: 'a', withShift: 'A', withAltGr: 'ä', withShiftAltGr: '' },
                KeyB: { value: 'b', withShift: 'ä', withAltGr: '', withShiftAltGr: '' }
            }
        };
        const service = await setup(layout, 'linux');
        const resolved = service.resolveKeyCode(KeyCode.parse('[char:0xC4]'));
        chai.expect(resolved.key).to.equal(Key.KEY_B);
        chai.expect(resolved.layoutModifiers).to.deep.equal('shift');
    });

    it('matches shifted physical scan-code bindings through the command interpretation', async () => {
        const us = require('../../../src/common/keyboard/layouts/en-US-pc.json');
        const service = await setup(us, 'linux');
        const physical = service.resolveKeyCode(KeyCode.parse('ctrl+shift+[BracketRight]'));
        const interpretations = service.getKeyCodeInterpretations({
            key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true
        }, 'code');
        chai.expect(physical.physical).to.be.true;
        chai.expect(interpretations.some(candidate => candidate.dispatchString() === physical.dispatchString())).to.be.true;
    });

    it('keeps BÉPO logical bindings distinct from their former US-position collisions', async () => {
        const bepo = require('../../../src/common/keyboard/layouts/fr-Bepo-pc.json');
        const service = await setup(bepo, 'linux');

        const undo = service.resolveKeyCode(KeyCode.parse('ctrl+z'));
        const outdent = service.resolveKeyCode(KeyCode.parse('ctrl+['));
        const close = service.resolveKeyCode(KeyCode.parse('ctrl+w'));
        const indent = service.resolveKeyCode(KeyCode.parse('ctrl+]'));
        chai.expect(undo.key).to.equal(Key.BRACKET_LEFT);
        chai.expect(outdent.key).to.equal(Key.DIGIT4);
        chai.expect(outdent.layoutModifiers).to.equal('altGraph');
        chai.expect(close.key).to.equal(Key.BRACKET_RIGHT);
        chai.expect(indent.key).to.equal(Key.DIGIT5);
        chai.expect(indent.layoutModifiers).to.equal('altGraph');
    });

    it('marks printable bindings unresolved when the layout mapping is empty', async () => {
        const layout: NativeKeyboardLayout = { info: { id: 'empty', lang: 'en' }, mapping: {} };
        const service = await setup(layout, 'linux');

        chai.expect(service.resolveKeyCode(KeyCode.parse('ctrl+[')).supportedByLayout).to.be.false;
        chai.expect(service.resolveKeyCode(KeyCode.parse('f1')).supportedByLayout).to.be.true;
    });

    it('marks unavailable logical characters unresolved instead of using the US position', async () => {
        const layout: NativeKeyboardLayout = {
            info: { id: 'missing-bracket', lang: 'en' },
            mapping: {
                KeyA: { value: 'a', withShift: 'A', withAltGr: '', withShiftAltGr: '' }
            }
        };
        const service = await setup(layout, 'linux');

        const outdent = service.resolveKeyCode(KeyCode.parse('ctrl+['));
        chai.expect(outdent.supportedByLayout).to.be.false;
        chai.expect(outdent.key).to.equal(Key.BRACKET_LEFT);
    });

    it('does not let a dead key hijack a keybinding on Mac (#17677)', async () => {
        // On macOS US Extended, Option+P is the "combining comma below" dead key whose display glyph
        // is reported as ',' by native-keymap. Since KeyP is reported before Comma, without honoring the
        // dead-key flags it would claim the ',' slot and resolve ctrlcmd+, to Cmd+Ctrl+Option+P.
        const macUSExtended: NativeKeyboardLayout = {
            info: { id: 'com.apple.keylayout.USExtended', lang: 'en' },
            mapping: {
                KeyP: {
                    value: 'p', valueIsDeadKey: false,
                    withShift: 'P', withShiftIsDeadKey: false,
                    withAltGr: ',', withAltGrIsDeadKey: true,
                    withShiftAltGr: '̦', withShiftAltGrIsDeadKey: true
                },
                Comma: {
                    value: ',', valueIsDeadKey: false,
                    withShift: '<', withShiftIsDeadKey: false,
                    withAltGr: '≤', withAltGrIsDeadKey: false,
                    withShiftAltGr: '¯', withShiftAltGrIsDeadKey: false
                }
            }
        };
        const service = await setup(macUSExtended, 'mac');

        const openSettings = service.resolveKeyCode(KeyCode.createKeyCode('Comma+M1'));
        chai.expect(openSettings.toString()).to.equal('meta+,');
        chai.expect(service.getKeyboardCharacter(openSettings.key!)).to.equal(',');
    });

    it('filters dead AltGraph mappings on Linux and Windows', async () => {
        const layout: NativeKeyboardLayout = {
            info: { id: 'dead-altgraph', lang: 'en' },
            mapping: {
                KeyP: {
                    value: 'p', withShift: 'P', withAltGr: '§', withShiftAltGr: '', withAltGrIsDeadKey: true
                } as never
            }
        };
        for (const system of ['linux', 'win'] as const) {
            const service = await setup(layout, system);
            chai.expect(service.resolveKeyCode(KeyCode.parse('§')).supportedByLayout).to.be.false;
            stubOSX.restore();
            stubWindows.restore();
        }
        stubOSX = sinon.stub(os, 'isOSX').value(false);
        stubWindows = sinon.stub(os, 'isWindows').value(false);
    });

    it('retains the Windows vkey fallback for value-less mappings', async () => {
        const layout: NativeKeyboardLayout = {
            info: { id: 'vkey-fallback', lang: 'en' },
            mapping: { KeyA: { vkey: 'VK_A', value: '' } as never }
        };
        const service = await setup(layout, 'win');
        const resolved = service.resolveKeyCode(KeyCode.parse('a'));
        chai.expect(resolved.supportedByLayout).to.be.true;
        chai.expect(resolved.key).to.equal(Key.KEY_A);
    });

    it('absorbs layout Shift identically for legacy and character-token spellings', async () => {
        const german = require('../../../src/common/keyboard/layouts/de-German-pc.json');
        const service = await setup(german, 'linux');
        const legacy = service.resolveKeyCode(KeyCode.parse('ctrl+shift+['));
        const character = service.resolveKeyCode(KeyCode.parse('ctrl+shift+[char:0x7B]'));
        chai.expect(legacy.shift).to.be.false;
        chai.expect(character.shift).to.be.false;
        chai.expect(legacy.dispatchString()).to.equal(character.dispatchString());
    });

    it('constructs Linux layout modifier interpretations only for participating AltGraph', async () => {
        const german = require('../../../src/common/keyboard/layouts/de-German-pc.json');
        const service = await setup(german, 'linux');

        const participating = service.getKeyCodeInterpretations({ key: '[', code: 'Digit8', altGraph: true }, 'code');
        chai.expect(participating).to.have.length(1);
        chai.expect(participating[0].layoutModifiers).to.deep.equal('altGraph');
        chai.expect(participating[0].dispatchString()).to.equal('8@altgraph');

        const nonParticipating = service.getKeyCodeInterpretations({ key: 'o', code: 'KeyO', altGraph: true }, 'code');
        chai.expect(nonParticipating[0].layoutModifiers).to.equal('none');

        const withoutModifierEvidence = service.getKeyCodeInterpretations({ key: '[', code: 'Digit8' }, 'code');
        chai.expect(withoutModifierEvidence[0].layoutModifiers).to.equal('none');

        const withCommandAlt = service.getKeyCodeInterpretations({ key: '[', code: 'Digit8', altKey: true, altGraph: true }, 'code');
        chai.expect(withCommandAlt[0].alt).to.be.true;
        chai.expect(withCommandAlt[0].layoutModifiers).to.equal('altGraph');
    });

    it('keeps shifted printable bindings symmetric in keyCode dispatch mode', async () => {
        const german = require('../../../src/common/keyboard/layouts/de-German-pc.json');
        const service = await setup(german, 'linux');

        const commandPalette = KeyCode.parse('ctrl+shift+p');
        const shiftedPrintable = KeyCode.parse('shift+/');
        chai.expect(service.getKeyCodeInterpretations({ key: 'P', code: 'KeyP', keyCode: Key.KEY_P.keyCode, ctrlKey: true, shiftKey: true }, 'keyCode')[0]
            .dispatchString()).to.equal(commandPalette.dispatchString());
        chai.expect(service.getKeyCodeInterpretations({ key: '/', code: 'Digit7', keyCode: Key.SLASH.keyCode, shiftKey: true }, 'keyCode')[0]
            .dispatchString()).to.equal(shiftedPrintable.dispatchString());
    });

    it('constructs command-first and layout modifier Windows interpretations', async () => {
        const german = require('../../../src/common/keyboard/layouts/de-German-pc.json');
        const service = await setup(german, 'win');

        const interpretations = service.getKeyCodeInterpretations({
            key: '[', code: 'Digit8', ctrlKey: true, altKey: true, altGraph: false
        }, 'code');
        chai.expect(interpretations.map(code => code.interpretation)).to.deep.equal(['commandModifiers', 'layoutModifiers']);
        chai.expect(interpretations[0].dispatchString()).to.equal('alt+ctrl+8');
        chai.expect(interpretations[1].dispatchString()).to.equal('ctrl+8@altgraph');

        const intentional = service.getKeyCodeInterpretations({
            key: 'f', code: 'KeyF', ctrlKey: true, altKey: true, altGraph: false
        }, 'code');
        chai.expect(intentional).to.have.length(1);
        chai.expect(intentional[0].dispatchString()).to.equal('alt+ctrl+f');

        const shiftedBinding = service.resolveKeyCode(KeyCode.parse('ctrl+shift+p'));
        const shiftedEvent = service.getKeyCodeInterpretations({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true }, 'code')
            .find(candidate => candidate.interpretation === 'layoutModifiers')!;
        chai.expect(shiftedBinding.supportedByLayout).to.be.true;
        chai.expect(shiftedEvent.dispatchString()).to.equal(shiftedBinding.dispatchString());
    });

    it('keeps legacy Windows AltGraph reporting typing-safe and preserves Meta', async () => {
        const german = require('../../../src/common/keyboard/layouts/de-German-pc.json');
        const service = await setup(german, 'win');
        const input = { key: '[', code: 'Digit8', ctrlKey: true, altKey: true, metaKey: true, altGraph: true };
        const keyCode = new KeyCode({ key: Key.DIGIT8, ctrl: true, alt: true, meta: true, character: '[' });

        const interpretations = service.getWindowsKeyCodeInterpretations(keyCode, input, 'altGraph');

        chai.expect(interpretations).to.have.length(1);
        chai.expect(interpretations[0].ctrl).to.be.false;
        chai.expect(interpretations[0].alt).to.be.false;
        chai.expect(interpretations[0].meta).to.be.true;
    });

    it('uses confirmed withAltGr output as Shift+AltGraph fallback when the shifted layer is absent', async () => {
        const layout: NativeKeyboardLayout = {
            info: { id: 'shift-altgraph-fallback', lang: 'en' },
            mapping: {
                Digit8: { value: '8', withShift: '*', withAltGr: '[', withShiftAltGr: '' }
            }
        };
        const service = await setup(layout, 'linux');

        chai.expect(service.detectLayoutModifiers({ key: '[', code: 'Digit8', shiftKey: true, altGraph: true }))
            .to.deep.equal('shiftAltGraph');
        chai.expect(service.detectLayoutModifiers({ key: '*', code: 'Digit8', shiftKey: true, altGraph: true }))
            .to.equal('shift');
    });

    it('passes raw normalized layer evidence to the key validator', async () => {
        let validated: KeyValidationInput | undefined;
        const validator: KeyValidator = { validateKey: validation => validated = validation };
        const german = require('../../../src/common/keyboard/layouts/de-German-pc.json');
        const service = await setup(german, 'linux', undefined, validator);
        const input = { key: '[', code: 'Digit8', ctrlKey: true, altGraph: true, shiftKey: false };
        const interpretation = service.getKeyCodeInterpretations(input, 'code')[0];

        service.validateKeyCode(interpretation, input);

        chai.expect(validated).to.deep.equal({
            code: 'Digit8', character: '[', shiftKey: false, ctrlKey: true, altKey: undefined, altGraph: true
        });
    });

    it('does not treat excluded or non-printable keys as layout modifier', async () => {
        const layout: NativeKeyboardLayout = {
            info: { id: 'native-shaped', lang: 'en' },
            mapping: {
                Space: { value: ' ', withShift: ' ', withAltGr: ' ', withShiftAltGr: ' ' },
                Numpad1: { value: '1', withShift: '1', withAltGr: '¹', withShiftAltGr: '¹' }
            }
        };
        const service = await setup(layout, 'linux');

        chai.expect(service.detectLayoutModifiers({ key: ' ', code: 'Space', shiftKey: true })).to.be.undefined;
        chai.expect(service.detectLayoutModifiers({ key: '¹', code: 'Numpad1', altGraph: true })).to.be.undefined;
    });

    it('ingests all Windows layout modifier layers across representative PC layouts', async () => {
        const fixtures = [
            { layout: require('../../../src/common/keyboard/layouts/de-German-pc.json'), assertions: [['²', Key.DIGIT2, false, true], ['ẞ', Key.MINUS, true, true]] },
            { layout: require('../../../src/common/keyboard/layouts/fr-French-pc.json'), assertions: [['€', Key.KEY_E, false, true]] },
            { layout: require('../../../src/common/keyboard/layouts/de-Swiss_German-pc.json'), assertions: [['@', Key.DIGIT2, false, true]] },
            { layout: require('../../../src/common/keyboard/layouts/fr-Bepo-pc.json'), assertions: [['Æ', Key.KEY_A, true, true]] }
        ] as const;

        for (const fixture of fixtures) {
            const service = await setup(fixture.layout, 'win');
            for (const [character, key, shift, altGraph] of fixture.assertions) {
                const resolved = service.resolveKeyCode(KeyCode.parse(character));
                chai.expect(resolved.key).to.equal(key);
                chai.expect(resolved.character).to.equal(character);
                const expected = shift ? 'shiftAltGraph' : altGraph ? 'altGraph' : 'none';
                chai.expect(resolved.layoutModifiers).to.equal(expected);
            }
            stubOSX.restore();
            stubWindows.restore();
        }
        stubOSX = sinon.stub(os, 'isOSX').value(false);
        stubWindows = sinon.stub(os, 'isWindows').value(false);
    });

    it('handles missing Windows layer values defensively', async () => {
        const layout: NativeKeyboardLayout = {
            info: { id: 'missing-windows-layers', lang: 'en' },
            mapping: { KeyA: { vkey: 'VK_A', value: 'a' } as never }
        };
        const service = await setup(layout, 'win');

        chai.expect(service.resolveKeyCode(KeyCode.parse('a')).supportedByLayout).to.be.true;
        chai.expect(service.resolveKeyCode(KeyCode.parse('§')).supportedByLayout).to.be.false;
    });

    it('resolves logical plus on US, German, and macOS layouts', async () => {
        const fixtures = [
            { layout: require('../../../src/common/keyboard/layouts/en-US-pc.json'), system: 'win' as const, key: Key.EQUAL, shift: true },
            { layout: require('../../../src/common/keyboard/layouts/de-German-pc.json'), system: 'win' as const, key: Key.BRACKET_RIGHT, shift: false },
            { layout: require('../../../src/common/keyboard/layouts/en-US-mac.json'), system: 'mac' as const, key: Key.EQUAL, shift: true }
        ];
        for (const fixture of fixtures) {
            const service = await setup(fixture.layout, fixture.system);
            const resolved = service.resolveKeyCode(KeyCode.parse('[char:0x2B]'));
            chai.expect(resolved.key).to.equal(fixture.key);
            chai.expect(resolved.layoutModifiers === 'shift' || resolved.layoutModifiers === 'shiftAltGraph').to.equal(fixture.shift);
            stubOSX.restore();
            stubWindows.restore();
        }
        stubOSX = sinon.stub(os, 'isOSX').value(false);
        stubWindows = sinon.stub(os, 'isWindows').value(false);
    });

    it('resolves correct key bindings with German Windows layout', async () => {
        const winGerman = require('../../../src/common/keyboard/layouts/de-German-pc.json');
        const service = await setup(winGerman, 'win');

        const toggleComment = service.resolveKeyCode(KeyCode.createKeyCode('Slash+M1'));
        chai.expect(toggleComment.toString()).to.equal('ctrl+7');
        chai.expect(toggleComment.character).to.equal('/');
        chai.expect(toggleComment.layoutModifiers).to.deep.equal('shift');
        chai.expect(service.getKeyboardCharacter(toggleComment.key!)).to.equal('7');

        const indentLine = service.resolveKeyCode(KeyCode.createKeyCode('BracketRight+M1'));
        chai.expect(indentLine.toString()).to.equal('ctrl+9');
        chai.expect(indentLine.character).to.equal(']');
        chai.expect(indentLine.layoutModifiers).to.deep.equal('altGraph');
        chai.expect(service.getKeyboardCharacter(indentLine.key!)).to.equal('9');
    });

    it('resolves correct key bindings with French Windows layout', async () => {
        const winFrench = require('../../../src/common/keyboard/layouts/fr-French-pc.json');
        const service = await setup(winFrench, 'win');

        const toggleComment = service.resolveKeyCode(KeyCode.createKeyCode('Slash+M1'));
        chai.expect(toggleComment.toString()).to.equal('ctrl+.');
        chai.expect(toggleComment.character).to.equal('/');
        chai.expect(toggleComment.layoutModifiers).to.deep.equal('shift');
        chai.expect(service.getKeyboardCharacter(toggleComment.key!)).to.equal(':');

        const indentLine = service.resolveKeyCode(KeyCode.createKeyCode('BracketRight+M1'));
        chai.expect(indentLine.toString()).to.equal('ctrl+-');
        chai.expect(indentLine.character).to.equal(']');
        chai.expect(indentLine.layoutModifiers).to.deep.equal('altGraph');
        chai.expect(service.getKeyboardCharacter(indentLine.key!)).to.equal(')');
    });

});
