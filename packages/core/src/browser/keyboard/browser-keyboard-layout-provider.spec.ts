/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { Container, injectable } from 'inversify';
import { IMacKeyboardLayoutInfo } from 'native-keymap';
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as os from '../../common/os';
import { ILogger, Loggable } from '../../common/logger';
import { LocalStorageService } from '../storage-service';
import { MessageService } from '../../common/message-service';
import { WindowService } from '../window/window-service';
import { BrowserKeyboardLayoutProvider } from './browser-keyboard-layout-provider';
import { Key } from './keys';

describe('browser keyboard layout provider', function () {

    let stubOSX: sinon.SinonStub;
    let stubWindows: sinon.SinonStub;
    let stubNavigator: sinon.SinonStub;

    const setup = (system: 'mac' | 'win' | 'linux') => {
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
        // tslint:disable-next-line:no-any
        stubNavigator = sinon.stub(global, 'navigator' as any).value({});
        const container = new Container();
        container.bind(BrowserKeyboardLayoutProvider).toSelf();
        container.bind(ILogger).to(MockLogger);
        container.bind(LocalStorageService).toSelf().inSingletonScope();
        container.bind(MessageService).toConstantValue({} as MessageService);
        container.bind(WindowService).toConstantValue({} as WindowService);
        const service = container.get(BrowserKeyboardLayoutProvider);
        return { service, container };
    };

    afterEach(() => {
        stubOSX.restore();
        stubWindows.restore();
        stubNavigator.restore();
    });

    it('detects German Mac layout', async () => {
        const { service } = setup('mac');
        let currentLayout = await service.getNativeLayout();
        service.onDidChangeNativeLayout(l => {
            currentLayout = l;
        });

        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.US');
        service.validateKey({ code: Key.SEMICOLON.code, character: 'ö' });
        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.German');
    });

    it('detects French Mac layout', async () => {
        const { service } = setup('mac');
        let currentLayout = await service.getNativeLayout();
        service.onDidChangeNativeLayout(l => {
            currentLayout = l;
        });

        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.US');
        service.validateKey({ code: Key.SEMICOLON.code, character: 'm' });
        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.French');
    });

    it('detects keyboard layout change', async () => {
        const { service } = setup('mac');
        let currentLayout = await service.getNativeLayout();
        service.onDidChangeNativeLayout(l => {
            currentLayout = l;
        });

        service.validateKey({ code: Key.QUOTE.code, character: 'ä' });
        service.validateKey({ code: Key.SEMICOLON.code, character: 'ö' });
        service.validateKey({ code: Key.BRACKET_LEFT.code, character: 'ü' });
        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.German');
        service.validateKey({ code: Key.SEMICOLON.code, character: 'm' });
        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.French');
    });

    it('applies layout chosen by the user', async () => {
        const { service } = setup('mac');
        let currentLayout = await service.getNativeLayout();
        service.onDidChangeNativeLayout(l => {
            currentLayout = l;
        });

        service.validateKey({ code: Key.SEMICOLON.code, character: 'm' });
        const spanishLayout = service.allLayoutData.find(data => data.name === 'Spanish' && data.hardware === 'mac')!;
        await service.setLayoutData(spanishLayout);
        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.Spanish');
        await service.setLayoutData('autodetect');
        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.French');
    });

    it('restores pressed keys from last session', async () => {
        const { service, container } = setup('mac');

        service.validateKey({ code: Key.SEMICOLON.code, character: 'm' });
        const service2 = container.get(BrowserKeyboardLayoutProvider);
        chai.expect(service2).to.not.equal(service);
        const currentLayout = await service2.getNativeLayout();
        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.French');
    });

    it('restores user selection from last session', async () => {
        const { service, container } = setup('mac');

        const spanishLayout = service.allLayoutData.find(data => data.name === 'Spanish' && data.hardware === 'mac')!;
        await service.setLayoutData(spanishLayout);
        const service2 = container.get(BrowserKeyboardLayoutProvider);
        chai.expect(service2).to.not.equal(service);
        service2.validateKey({ code: Key.SEMICOLON.code, character: 'm' });
        const currentLayout = await service2.getNativeLayout();
        chai.expect((currentLayout.info as IMacKeyboardLayoutInfo).id).to.equal('com.apple.keylayout.Spanish');
    });

});

@injectable()
class MockLogger implements Partial<ILogger> {
    trace(loggable: Loggable): Promise<void> {
        return Promise.resolve();
    }
    debug(loggable: Loggable): Promise<void> {
        return Promise.resolve();
    }
    info(loggable: Loggable): Promise<void> {
        return Promise.resolve();
    }
    warn(loggable: Loggable): Promise<void> {
        return Promise.resolve();
    }
    error(loggable: Loggable): Promise<void> {
        return Promise.resolve();
    }
    fatal(loggable: Loggable): Promise<void> {
        return Promise.resolve();
    }
}
