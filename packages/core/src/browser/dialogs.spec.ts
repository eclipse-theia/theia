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

import * as assert from 'assert';
import { enableJSDOM } from './test/jsdom';

let disableJSDOM = enableJSDOM();

import { AbstractDialog, ConfirmDialog, ConfirmSaveDialog, SingleTextInputDialog } from './dialogs';
import { JSDOM } from 'jsdom';

class TestDialog extends AbstractDialog<string> {
    get value(): string {
        return 'test';
    }

    getButtonFromDocument(text: string): HTMLButtonElement {
        return this.createButton(text);
    }

    get dialogContentNode(): HTMLDivElement {
        return this.contentNode;
    }

    get dialogControlPanel(): HTMLDivElement {
        return this.controlPanel;
    }
}

describe('AbstractDialog', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('should create dialog elements in the main document by default', () => {
        const dialog = new TestDialog({ title: 'Test Dialog' });
        assert.strictEqual(dialog.node.ownerDocument, document);
    });

    it('should create dialog elements in the target window document when targetWindow is set', () => {
        const secondaryDom = new JSDOM('<!doctype html><html><body></body></html>');
        const secondaryWindow = secondaryDom.window as unknown as Window;

        const dialog = new TestDialog({
            title: 'Test Dialog',
            targetWindow: secondaryWindow
        });

        assert.strictEqual(dialog.node.ownerDocument, secondaryWindow.document);
    });

    it('should create buttons in the correct document when targetWindow is set', () => {
        const secondaryDom = new JSDOM('<!doctype html><html><body></body></html>');
        const secondaryWindow = secondaryDom.window as unknown as Window;

        const dialog = new TestDialog({
            title: 'Test Dialog',
            targetWindow: secondaryWindow
        });

        const button = dialog.getButtonFromDocument('Click Me');
        assert.strictEqual(button.ownerDocument, secondaryWindow.document);
        assert.strictEqual(button.textContent, 'Click Me');
        assert.ok(button.classList.contains('theia-button'));
    });

    it('should create buttons in the main document by default', () => {
        const dialog = new TestDialog({ title: 'Test Dialog' });
        const button = dialog.getButtonFromDocument('Click Me');
        assert.strictEqual(button.ownerDocument, document);
    });

    it('should create internal elements (container, titleNode, contentNode) in the target document', () => {
        const secondaryDom = new JSDOM('<!doctype html><html><body></body></html>');
        const secondaryWindow = secondaryDom.window as unknown as Window;

        const dialog = new TestDialog({
            title: 'Test Dialog',
            targetWindow: secondaryWindow
        });

        assert.strictEqual(dialog.dialogContentNode.ownerDocument, secondaryWindow.document);
        assert.strictEqual(dialog.dialogControlPanel.ownerDocument, secondaryWindow.document);
    });

    it('should respect explicitly provided node option over targetWindow', () => {
        const secondaryDom = new JSDOM('<!doctype html><html><body></body></html>');
        const secondaryWindow = secondaryDom.window as unknown as Window;

        const anotherDom = new JSDOM('<!doctype html><html><body></body></html>');
        const anotherWindow = anotherDom.window as unknown as Window;
        const customNode = anotherWindow.document.createElement('div');

        const dialog = new TestDialog({
            title: 'Test Dialog',
            targetWindow: secondaryWindow
        }, {
            node: customNode
        });

        // The explicit node takes precedence
        assert.strictEqual(dialog.node.ownerDocument, anotherWindow.document);
    });
});

describe('ConfirmDialog', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('should create message node in the target document when targetWindow is set', () => {
        const secondaryDom = new JSDOM('<!doctype html><html><body></body></html>');
        const secondaryWindow = secondaryDom.window as unknown as Window;

        const dialog = new ConfirmDialog({
            title: 'Confirm',
            msg: 'Are you sure?',
            targetWindow: secondaryWindow
        });

        assert.strictEqual(dialog.node.ownerDocument, secondaryWindow.document);
    });
});

describe('ConfirmSaveDialog', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('should create elements in the target document when targetWindow is set', () => {
        const secondaryDom = new JSDOM('<!doctype html><html><body></body></html>');
        const secondaryWindow = secondaryDom.window as unknown as Window;

        const dialog = new ConfirmSaveDialog({
            title: 'Save',
            msg: 'Save changes?',
            cancel: 'Cancel',
            dontSave: "Don't Save",
            save: 'Save',
            targetWindow: secondaryWindow
        });

        assert.strictEqual(dialog.node.ownerDocument, secondaryWindow.document);
    });
});

describe('SingleTextInputDialog', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('should create input field in the target document when targetWindow is set', () => {
        const secondaryDom = new JSDOM('<!doctype html><html><body></body></html>');
        const secondaryWindow = secondaryDom.window as unknown as Window;

        const dialog = new SingleTextInputDialog({
            title: 'Input',
            initialValue: 'hello',
            targetWindow: secondaryWindow
        });

        assert.strictEqual(dialog.node.ownerDocument, secondaryWindow.document);
    });
});
