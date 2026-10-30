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
    const mirror = new SecondaryWindowStyleMirror();
    // Stub the @inject-decorated field that inversify would normally provide
    (mirror as unknown as { secondaryWindowService: Partial<SecondaryWindowService> }).secondaryWindowService = {
        onWindowLoaded: onWindowLoadedEmitter.event,
        onWindowClosed: onWindowClosedEmitter.event,
    };
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

    afterEach(() => {
        mirror.onStop();
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

        it('excludes elements with class theia-icon-theme', () => {
            const style = document.createElement('style');
            style.classList.add('theia-icon-theme');
            style.textContent = '.icon-theme { background: url(icon.png); }';
            document.head.appendChild(style);

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            const clonedStyles = secondaryWin.document.head.querySelectorAll('style');
            const clonedTexts = Array.from(clonedStyles).map(s => s.textContent);
            expect(clonedTexts).to.not.include('.icon-theme { background: url(icon.png); }');
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

        it('preserves secondary-window-only classes when main body changes', async () => {
            document.body.classList.add('theia-dark');

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            // Secondary window adds its own class (e.g. maximized from setupMaximizeRestoreToggle)
            secondaryWin.document.body.classList.add('maximized');

            // Main body changes — add a new class
            document.body.classList.add('theia-mod-debugging');

            // Wait for MutationObserver
            await new Promise(resolve => setTimeout(resolve, 10));

            // The secondary-window-only class should be preserved
            expect(secondaryWin.document.body.classList.contains('maximized')).to.be.true;
            // The newly added main class should be propagated
            expect(secondaryWin.document.body.classList.contains('theia-mod-debugging')).to.be.true;
            // The original main class should still be there
            expect(secondaryWin.document.body.classList.contains('theia-dark')).to.be.true;
        });

        it('does not remove secondary-only classes when main class is removed', async () => {
            document.body.classList.add('theia-dark');

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            // Secondary window adds its own class
            secondaryWin.document.body.classList.add('maximized');

            // Remove a class from main
            document.body.classList.remove('theia-dark');

            // Wait for MutationObserver
            await new Promise(resolve => setTimeout(resolve, 10));

            // The main-originated class should be removed
            expect(secondaryWin.document.body.classList.contains('theia-dark')).to.be.false;
            // The secondary-only class should still be there
            expect(secondaryWin.document.body.classList.contains('maximized')).to.be.true;
        });

        it('only removes classes that were added by the mirror', async () => {
            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            // Secondary window has a class that was never from main
            secondaryWin.document.body.classList.add('custom-secondary-class');

            // Add and then remove a class from main
            document.body.classList.add('temp-class');
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(secondaryWin.document.body.classList.contains('temp-class')).to.be.true;

            document.body.classList.remove('temp-class');
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(secondaryWin.document.body.classList.contains('temp-class')).to.be.false;
            expect(secondaryWin.document.body.classList.contains('custom-secondary-class')).to.be.true;
        });
    });

    describe('bundle.css duplication prevention', () => {

        it('skips cloning a link element whose href already exists in the secondary window', () => {
            // Simulate a <link> in the main window
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = './bundle.css';
            document.head.appendChild(link);

            mirror.onStart();

            const secondaryWin = createSecondaryWindow();

            // Pre-add a matching <link> in the secondary window (as the HTML template would)
            const existingLink = secondaryWin.document.createElement('link');
            existingLink.rel = 'stylesheet';
            existingLink.href = './bundle.css';
            secondaryWin.document.head.appendChild(existingLink);

            onWindowLoadedEmitter.fire(secondaryWin);

            // Should still have only the one pre-existing link, not a duplicate
            const links = secondaryWin.document.head.querySelectorAll('link[rel="stylesheet"]');
            expect(links.length).to.equal(1);
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

        it('cleans up mainOriginatedClasses when window is closed', () => {
            mirror.onStart();

            const secondaryWin = createSecondaryWindow();
            onWindowLoadedEmitter.fire(secondaryWin);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mirrorAny = mirror as any;
            expect(mirrorAny.mainOriginatedClasses.has(secondaryWin)).to.be.true;

            onWindowClosedEmitter.fire(secondaryWin);

            expect(mirrorAny.mainOriginatedClasses.has(secondaryWin)).to.be.false;
        });
    });
});
