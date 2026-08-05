// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
FrontendApplicationConfigProvider.set({});

// jsdom does not implement queryCommandSupported, which common-frontend-contribution
// evaluates at module load to determine cut/copy/paste support.
document.queryCommandSupported = () => false;

import * as chai from 'chai';
import { Emitter } from '../common/event';
// Initialize the common barrel before common-frontend-contribution: its import graph contains
// cycles through the barrel (e.g. shell/tab-bar-toolbar) that leave injection tokens undefined
// when the contribution module itself is the entry point.
import '../common';
import { CLASSNAME_OS_LINUX, CLASSNAME_OS_MAC, CLASSNAME_OS_WINDOWS, CommonFrontendContribution } from './common-frontend-contribution';
import { SecondaryWindowService } from './window/secondary-window-service';

disableJSDOM();

const expect = chai.expect;
const OS_CLASSNAMES = [CLASSNAME_OS_MAC, CLASSNAME_OS_WINDOWS, CLASSNAME_OS_LINUX];

describe('CommonFrontendContribution', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
        document.queryCommandSupported = () => false;
    });

    after(() => {
        disableJSDOM();
    });

    describe('setOsClass', () => {

        let onWindowOpenedEmitter: Emitter<Window>;
        let contribution: CommonFrontendContribution;

        beforeEach(() => {
            document.body.classList.remove(...OS_CLASSNAMES);
            onWindowOpenedEmitter = new Emitter<Window>();
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            const unused = undefined as any;
            contribution = new CommonFrontendContribution(unused, unused, unused, unused, unused, unused, unused);
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            (contribution as any).secondaryWindowService = <Partial<SecondaryWindowService>>{
                onWindowOpened: onWindowOpenedEmitter.event
            };
        });

        /** Fake secondary window: a bare body plus DOMContentLoaded listener registration. */
        function fakeSecondaryWindow(): { win: Window, body: HTMLElement, loadDocument: () => void } {
            const body = document.createElement('body');
            const loadListeners: EventListener[] = [];
            const win = <Partial<Window>>{
                document: <Partial<Document>>{ body },
                addEventListener: (type: string, listener: EventListener) => {
                    if (type === 'DOMContentLoaded') {
                        loadListeners.push(listener);
                    }
                }
            };
            return {
                win: win as Window,
                body,
                loadDocument: () => loadListeners.splice(0).forEach(listener => listener(new Event('DOMContentLoaded')))
            };
        }

        it('adds the OS class to the main window body', () => {
            contribution['setOsClass']();
            expect(OS_CLASSNAMES.filter(c => document.body.classList.contains(c))).to.have.lengthOf(1);
        });

        it('adds the OS class to a secondary window body once its document is loaded', () => {
            contribution['setOsClass']();
            const osClass = OS_CLASSNAMES.find(c => document.body.classList.contains(c))!;

            const { win, body, loadDocument } = fakeSecondaryWindow();
            onWindowOpenedEmitter.fire(win);
            // The initial about:blank document is replaced by secondary-window.html,
            // so the class must only be added to the final document.
            expect(body.classList.contains(osClass), 'class must not be added before DOMContentLoaded').to.be.false;

            loadDocument();
            expect(body.classList.contains(osClass), 'class must be added after DOMContentLoaded').to.be.true;
        });
    });
});
