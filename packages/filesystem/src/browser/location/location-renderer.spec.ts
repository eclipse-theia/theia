// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import URI from '@theia/core/lib/common/uri';
import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import type { FileDialogModel } from '../file-dialog/file-dialog-model';
import { LocationListRenderer } from './location-renderer';
import type { LocationService } from './location-service';

disableJSDOM();

class TestableLocationListRenderer extends LocationListRenderer {
    // Expose protected methods for testing
    testLooksLikeFilePath(value: string): boolean {
        return this.looksLikeFilePath(value);
    }

    testToFileURI(filePath: string): URI {
        return this.toFileURI(filePath);
    }

    testTryRenderFirstMatch(inputElement: HTMLInputElement, children: string[]): void {
        this.tryRenderFirstMatch(inputElement, children);
    }

    testRenderSelectInput(): React.ReactNode {
        return this.renderSelectInput();
    }
}

function createMockService(): LocationService {
    return {
        location: undefined,
        drives: () => Promise.resolve([])
    };
}

function createRenderer(): TestableLocationListRenderer {
    const host = document.createElement('div');
    const service = createMockService();
    const renderer = new TestableLocationListRenderer({ model: service as unknown as FileDialogModel, host });
    return renderer;
}

describe('LocationListRenderer', () => {
    let renderer: TestableLocationListRenderer;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        renderer = createRenderer();
    });

    afterEach(() => {
        renderer.dispose();
    });

    describe('looksLikeFilePath', () => {
        it('should recognize Unix absolute paths', () => {
            expect(renderer.testLooksLikeFilePath('/home/user/folder')).to.be.true;
            expect(renderer.testLooksLikeFilePath('/usr/local/bin')).to.be.true;
            expect(renderer.testLooksLikeFilePath('/')).to.be.true;
        });

        it('should recognize tilde paths', () => {
            expect(renderer.testLooksLikeFilePath('~/Documents')).to.be.true;
            expect(renderer.testLooksLikeFilePath('~/projects/theia')).to.be.true;
        });

        it('should recognize Windows drive letter paths with backslashes', () => {
            expect(renderer.testLooksLikeFilePath('C:\\')).to.be.true;
            expect(renderer.testLooksLikeFilePath('C:\\Users\\folder')).to.be.true;
            expect(renderer.testLooksLikeFilePath('D:\\Projects')).to.be.true;
        });

        it('should recognize Windows drive letter paths with forward slashes', () => {
            expect(renderer.testLooksLikeFilePath('C:/')).to.be.true;
            expect(renderer.testLooksLikeFilePath('C:/Users/folder')).to.be.true;
            expect(renderer.testLooksLikeFilePath('d:/projects')).to.be.true;
        });

        it('should reject non-path strings', () => {
            expect(renderer.testLooksLikeFilePath('hello')).to.be.false;
            expect(renderer.testLooksLikeFilePath('file:///foo')).to.be.false;
            expect(renderer.testLooksLikeFilePath('http://example.com')).to.be.false;
            expect(renderer.testLooksLikeFilePath('')).to.be.false;
            expect(renderer.testLooksLikeFilePath('relative/path')).to.be.false;
        });
    });

    describe('tryRenderFirstMatch', () => {
        function createTextInput(host: HTMLElement, value: string): HTMLInputElement {
            const input = document.createElement('input');
            input.className = 'theia-select theia-LocationTextInput';
            input.value = value;
            input.selectionStart = value.length;
            host.appendChild(input);
            return input;
        }

        it('should autocomplete Unix paths preserving format', () => {
            const host = document.createElement('div');
            const service = createMockService();
            const r = new TestableLocationListRenderer({ model: service as unknown as FileDialogModel, host });
            const input = createTextInput(host, '/home/user/Do');
            const children = ['/home/user/Documents/', '/home/user/Downloads/'];

            r.testTryRenderFirstMatch(input, children);

            expect(input.value).to.equal('/home/user/Documents/');
            expect(input.selectionStart).to.equal('/home/user/Do'.length);
            expect(input.selectionEnd).to.equal('/home/user/Documents/'.length);
            r.dispose();
        });

        it('should autocomplete Windows-style paths in native format', () => {
            const host = document.createElement('div');
            const service = createMockService();
            const r = new TestableLocationListRenderer({ model: service as unknown as FileDialogModel, host });
            const input = createTextInput(host, 'C:\\Users\\user\\Do');
            // Children from the cache are already stored as native filesystem paths
            const children = ['C:\\Users\\user\\Documents\\', 'C:\\Users\\user\\Downloads\\'];

            r.testTryRenderFirstMatch(input, children);

            expect(input.value).to.equal('C:\\Users\\user\\Documents\\');
            expect(input.selectionStart).to.equal('C:\\Users\\user\\Do'.length);
            expect(input.selectionEnd).to.equal('C:\\Users\\user\\Documents\\'.length);
            r.dispose();
        });

        it('should not modify input when no children match', () => {
            const host = document.createElement('div');
            const service = createMockService();
            const r = new TestableLocationListRenderer({ model: service as unknown as FileDialogModel, host });
            const input = createTextInput(host, '/home/user/xyz');
            const children = ['/home/user/Documents/', '/home/user/Downloads/'];

            r.testTryRenderFirstMatch(input, children);

            expect(input.value).to.equal('/home/user/xyz');
            r.dispose();
        });
    });

    describe('renderSelectInput', () => {
        it('should render select with value matching the current service location', () => {
            const host = document.createElement('div');
            const service = createMockService();
            const location = URI.fromFilePath('/home/user/folder');
            service.location = location;
            const r = new TestableLocationListRenderer({ model: service as unknown as FileDialogModel, host });

            const selectElement = r.testRenderSelectInput() as React.ReactElement;

            expect(selectElement.props.value).to.equal(location.toString());
            r.dispose();
        });

        it('should update select value when service location changes across drives', () => {
            const host = document.createElement('div');
            const service = createMockService();
            service.location = URI.fromFilePath('/d:/Projects/theia');
            const r = new TestableLocationListRenderer({ model: service as unknown as FileDialogModel, host });

            // Simulate the model navigating to a different drive
            const newLocation = URI.fromFilePath('/c:/Users');
            service.location = newLocation;

            const selectElement = r.testRenderSelectInput() as React.ReactElement;

            expect(selectElement.props.value).to.equal(newLocation.toString());
            r.dispose();
        });
    });

    describe('toFileURI', () => {
        it('should convert Unix absolute paths to file URIs', () => {
            const uri = renderer.testToFileURI('/home/user/folder');
            expect(uri.scheme).to.equal('file');
            expect(uri.path.toString()).to.equal('/home/user/folder');
        });

        it('should convert Windows paths with backslashes to file URIs', () => {
            const uri = renderer.testToFileURI('C:\\Users\\folder');
            expect(uri.scheme).to.equal('file');
            // vscode-uri normalizes drive letters to lowercase
            expect(uri.path.toString()).to.equal('/c:/Users/folder');
        });

        it('should convert Windows paths with forward slashes to file URIs', () => {
            const uri = renderer.testToFileURI('C:/Users/folder');
            expect(uri.scheme).to.equal('file');
            expect(uri.path.toString()).to.equal('/c:/Users/folder');
        });

        it('should handle Windows drive root', () => {
            const uri = renderer.testToFileURI('C:\\');
            expect(uri.scheme).to.equal('file');
            expect(uri.path.toString()).to.equal('/c:/');
        });

        it('should produce a URI that differs from naive URI parsing for Windows paths', () => {
            // new URI('C:\\Users') incorrectly treats 'C' as the scheme
            const naiveUri = new URI('C:\\Users');
            expect(naiveUri.scheme).to.equal('C');

            // URI.fromFilePath correctly creates a file:// URI
            const correctUri = renderer.testToFileURI('C:\\Users');
            expect(correctUri.scheme).to.equal('file');
        });
    });
});
