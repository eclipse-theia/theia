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
import { KeyCode } from './keys';
import { KeyboardLayoutService } from './keyboard-layout-service';
import { KeyboardLayoutProvider, NativeKeyboardLayout, KeyboardLayoutChangeNotifier } from '../../common/keyboard/keyboard-layout-provider';
import * as os from '../../common/os';
import * as chai from 'chai';
import * as sinon from 'sinon';

describe('keyboard layout service', function (): void {

    let stubOSX: sinon.SinonStub;
    let stubWindows: sinon.SinonStub;

    const setup = async (layout: NativeKeyboardLayout, system: 'mac' | 'win' | 'linux') => {
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
        container.bind(KeyboardLayoutService).toSelf().inSingletonScope();
        @injectable()
        class MockLayoutProvider implements KeyboardLayoutProvider, KeyboardLayoutChangeNotifier {
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
        const service = container.get(KeyboardLayoutService);
        await service.initialize();
        return service;
    };

    afterEach(() => {
        stubOSX.restore();
        stubWindows.restore();
    });

    it('resolves correct key bindings with German Mac layout', async () => {
        const macGerman = require('../../../src/common/keyboard/layouts/de-German-mac.json');
        const service = await setup(macGerman, 'mac');

        const toggleComment = service.resolveKeyCode(KeyCode.createKeyCode('Slash+M1'));
        chai.expect(toggleComment.toString()).to.equal('meta+shift+7');
        chai.expect(service.getKeyboardCharacter(toggleComment.key!)).to.equal('7');

        const indentLine = service.resolveKeyCode(KeyCode.createKeyCode('BracketRight+M1'));
        chai.expect(indentLine.toString()).to.equal('meta+alt+ctrl+6');
        chai.expect(service.getKeyboardCharacter(indentLine.key!)).to.equal('6');
    });

    it('resolves correct key bindings with French Mac layout', async () => {
        const macFrench = require('../../../src/common/keyboard/layouts/fr-French-mac.json');
        const service = await setup(macFrench, 'mac');

        const toggleComment = service.resolveKeyCode(KeyCode.createKeyCode('Slash+M1'));
        chai.expect(toggleComment.toString()).to.equal('meta+shift+.');
        chai.expect(service.getKeyboardCharacter(toggleComment.key!)).to.equal(':');

        const indentLine = service.resolveKeyCode(KeyCode.createKeyCode('BracketRight+M1'));
        chai.expect(indentLine.toString()).to.equal('meta+shift+alt+ctrl+-');
        chai.expect(service.getKeyboardCharacter(indentLine.key!)).to.equal(')');
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

    it('resolves correct key bindings with German Windows layout', async () => {
        const winGerman = require('../../../src/common/keyboard/layouts/de-German-pc.json');
        const service = await setup(winGerman, 'win');

        const toggleComment = service.resolveKeyCode(KeyCode.createKeyCode('Slash+M1'));
        chai.expect(toggleComment.toString()).to.equal('ctrl+\\');
        chai.expect(service.getKeyboardCharacter(toggleComment.key!)).to.equal('#');

        const indentLine = service.resolveKeyCode(KeyCode.createKeyCode('BracketRight+M1'));
        chai.expect(indentLine.toString()).to.equal('ctrl+=');
        chai.expect(service.getKeyboardCharacter(indentLine.key!)).to.equal('´');
    });

    it('resolves correct key bindings with French Windows layout', async () => {
        const winFrench = require('../../../src/common/keyboard/layouts/fr-French-pc.json');
        const service = await setup(winFrench, 'win');

        const toggleComment = service.resolveKeyCode(KeyCode.createKeyCode('Slash+M1'));
        chai.expect(toggleComment.toString()).to.equal('ctrl+.');
        chai.expect(service.getKeyboardCharacter(toggleComment.key!)).to.equal(':');

        const indentLine = service.resolveKeyCode(KeyCode.createKeyCode('BracketRight+M1'));
        chai.expect(indentLine.toString()).to.equal('ctrl+[');
        chai.expect(service.getKeyboardCharacter(indentLine.key!)).to.equal('^');
    });

});
