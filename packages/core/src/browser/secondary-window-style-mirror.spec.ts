// *****************************************************************************
// Copyright (C) 2026 and others.
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

import * as chai from 'chai';
import { Emitter } from '../common/event';
import { SecondaryWindowStyleMirror } from './secondary-window-style-mirror';
import { SecondaryWindowService } from './window/secondary-window-service';
import { JSDOM } from 'jsdom';

disableJSDOM();

const expect = chai.expect;

function createSecondaryWindow(): Window {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
    const win = dom.window as unknown as Window;
    // JSDOM doesn't support requestAnimationFrame, so stub it
    (win as { requestAnimationFrame: (cb: () => void) => void }).requestAnimationFrame = (cb: () => void) => { cb(); };
    return win;
}

function createMirror(
    onWindowLoadedEmitter: Emitter<Window>,
    onWindowClosedEmitter: Emitter<Window>
): SecondaryWindowStyleMirror {
    const mirror = Object.create(SecondaryWindowStyleMirror.prototype);
    (mirror as { secondaryWindowService: Partial<SecondaryWindowService> }).secondaryWindowService = {
        onWindowLoaded: onWindowLoadedEmitter.event,
        onWindowClosed: onWindowClosedEmitter.event,
    };
    // Initialize internal state
    (mirror as { cloneMap: Map<unknown, unknown> }).cloneMap = new Map();
    (mirror as { trackedWindows: Set<Window> }).trackedWindows = new Set();
    (mirror as { cssomRules: Map<unknown, unknown> }).cssomRules = new Map();
    return mirror;
}

describe('SecondaryWindowStyleMirror', () => {
    let onWindowLoadedEmitter: Emitter<Window>;
    let onWindowClosedEmitter: Emitter<Window>;
    let mirror: SecondaryWindowStyleMirror;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        // Clear the main document head of any style/link elements from prior tests
        document.head.querySelectorAll('style, link').forEach(el => el.remove());
        document.body.className = '';

        onWindowLoadedEmitter = new Emitter<Window>();
        onWindowClosedEmitter = new Emitter<Window>();
        mirror = createMirror(onWindowLoadedEmitter, onWindowClosedEmitter);
    });

    describe('style element mirroring', () => {

        it('clones existing style elements into a newly opened secondary window', () => {
            const style = document.createElement('style');
            style.textContent = '.test { color: red; }';
            document.head.appendChild(style);

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            const clonedStyles = secondaryWin.document.head.querySelectorAll('style');
            expect(clonedStyles.length).to.be.greaterThan(0);

            const clonedTexts = Array.from(clonedStyles).map(s => s.textContent);
            expect(clonedTexts).to.include('.test { color: red; }');
        });

        it('clones style elements added after a secondary window has opened', async () => {
            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            // Add a new style element to the main head
            const style = document.createElement('style');
            style.textContent = '.dynamic { color: blue; }';
            document.head.appendChild(style);

            // MutationObserver is async — wait for it
            await new Promise(resolve => setTimeout(resolve, 10));

            const clonedStyles = secondaryWin.document.head.querySelectorAll('style');
            const clonedTexts = Array.from(clonedStyles).map(s => s.textContent);
            expect(clonedTexts).to.include('.dynamic { color: blue; }');
        });

        it('removes cloned elements when the source is removed from main head', async () => {
            const style = document.createElement('style');
            style.textContent = '.removable { color: green; }';
            document.head.appendChild(style);

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            // Verify it was cloned
            let clonedStyles = secondaryWin.document.head.querySelectorAll('style');
            let clonedTexts = Array.from(clonedStyles).map(s => s.textContent);
            expect(clonedTexts).to.include('.removable { color: green; }');

            // Remove from main head
            style.remove();

            // Wait for MutationObserver
            await new Promise(resolve => setTimeout(resolve, 10));

            clonedStyles = secondaryWin.document.head.querySelectorAll('style');
            clonedTexts = Array.from(clonedStyles).map(s => s.textContent);
            expect(clonedTexts).to.not.include('.removable { color: green; }');
        });
    });

    describe('exclusions', () => {

        it('excludes elements with class monaco-colors', () => {
            const style = document.createElement('style');
            style.classList.add('monaco-colors');
            style.textContent = '.monaco { color: white; }';
            document.head.appendChild(style);

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            const clonedStyles = secondaryWin.document.head.querySelectorAll('style');
            const clonedTexts = Array.from(clonedStyles).map(s => s.textContent);
            expect(clonedTexts).to.not.include('.monaco { color: white; }');
        });

        it('excludes elements with id contributedColorTheme', () => {
            const style = document.createElement('style');
            style.id = 'contributedColorTheme';
            style.textContent = '.contributed { color: black; }';
            document.head.appendChild(style);

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            const clonedStyles = secondaryWin.document.head.querySelectorAll('style');
            const clonedTexts = Array.from(clonedStyles).map(s => s.textContent);
            expect(clonedTexts).to.not.include('.contributed { color: black; }');
        });
    });

    describe('body class mirroring', () => {

        it('syncs body classes to secondary window on open', () => {
            document.body.classList.add('theia-dark', 'vs-dark');

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            expect(secondaryWin.document.body.classList.contains('theia-dark')).to.be.true;
            expect(secondaryWin.document.body.classList.contains('vs-dark')).to.be.true;
        });

        it('propagates body class additions from main to secondary windows', async () => {
            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            document.body.classList.add('theia-mod-debugging');

            // Wait for MutationObserver
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(secondaryWin.document.body.classList.contains('theia-mod-debugging')).to.be.true;
        });

        it('propagates body class removals from main to secondary windows', async () => {
            document.body.classList.add('theia-mod-debugging');

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            expect(secondaryWin.document.body.classList.contains('theia-mod-debugging')).to.be.true;

            document.body.classList.remove('theia-mod-debugging');

            // Wait for MutationObserver
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(secondaryWin.document.body.classList.contains('theia-mod-debugging')).to.be.false;
        });
    });

    describe('window lifecycle', () => {

        it('stops tracking a closed window', async () => {
            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            // Close the window
            onWindowClosedEmitter.fire(secondaryWin);

            // Add a new style — it should NOT appear in the closed window
            const style = document.createElement('style');
            style.textContent = '.after-close { color: pink; }';
            document.head.appendChild(style);

            await new Promise(resolve => setTimeout(resolve, 10));

            const clonedStyles = secondaryWin.document.head.querySelectorAll('style');
            const clonedTexts = Array.from(clonedStyles).map(s => s.textContent);
            expect(clonedTexts).to.not.include('.after-close { color: pink; }');
        });
    });
});
