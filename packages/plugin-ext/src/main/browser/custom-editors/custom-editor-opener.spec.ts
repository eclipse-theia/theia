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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import * as chai from 'chai';
import URI from '@theia/core/lib/common/uri';
import { PreferenceService } from '@theia/core';
import { EditorOpenerOptions } from '@theia/editor/lib/browser';
import { CustomEditorOpener } from './custom-editor-opener';
import { CustomEditor, CustomEditorPriority } from '../../../common';

disableJSDOM();

const expect = chai.expect;

describe('CustomEditorOpener#selectorMatches', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    // Only selector matching is exercised — none of the collaborators are touched.
    function createOpener(filenamePattern: string): CustomEditorOpener {
        const editor: CustomEditor = {
            viewType: 'test.editor',
            displayName: 'Test Editor',
            selector: [{ filenamePattern }],
            priority: CustomEditorPriority.default
        };
        return new CustomEditorOpener(editor, undefined!, undefined!, undefined!, undefined!);
    }

    function matches(filenamePattern: string, path: string): boolean {
        const opener = createOpener(filenamePattern);
        return opener.matches([{ filenamePattern }], new URI(`file://${path}`));
    }

    function matchesUri(filenamePattern: string, uri: string): boolean {
        const opener = createOpener(filenamePattern);
        return opener.matches([{ filenamePattern }], new URI(uri));
    }

    it('matches a plain extension pattern against the basename', () => {
        expect(matches('*.custom', '/project/src/file.custom')).true;
        expect(matches('*.custom', '/project/src/file.other')).false;
    });

    it('matches a plain filename pattern against the basename anywhere', () => {
        expect(matches('config.json', '/anywhere/at/all/config.json')).true;
        expect(matches('config.json', '/anywhere/at/all/other.json')).false;
    });

    it('matches case-insensitively', () => {
        expect(matches('*.CUSTOM', '/project/file.custom')).true;
        expect(matches('*.custom', '/project/FILE.CUSTOM')).true;
    });

    it('matches a pattern containing a path separator against the full path (VS Code parity)', () => {
        const pattern = '**/components/*/config.json';
        expect(matches(pattern, '/project/src/components/button/config.json')).true;
        expect(matches(pattern, '/project/elsewhere/config.json')).false;
        expect(matches(pattern, '/project/src/components/button/nested/config.json')).false;
    });

    it('matches nested path patterns', () => {
        const pattern = '**/components/*/styles/*.css';
        expect(matches(pattern, '/project/src/components/button/styles/theme.css')).true;
        expect(matches(pattern, '/project/src/components/button/config.json')).false;
        expect(matches(pattern, '/project/src/components/button/styles/dark/theme.css')).false;
    });

    it('does not let a path pattern match a bare basename', () => {
        expect(matches('**/components/*/config.json', '/config.json')).false;
    });

    it('never matches the excluded schemes, mirroring VS Code (globMatchesResource)', () => {
        // Patterns that would match the basename or full path on a `file:` resource...
        expect(matchesUri('*.json', 'file:///project/settings.json')).true;
        expect(matchesUri('**/settings.json', 'file:///project/settings.json')).true;
        // ...must not match on VS Code's internal schemes.
        expect(matchesUri('*.json', 'vscode-settings:/settings.json')).false;
        expect(matchesUri('**/settings.json', 'vscode-settings:/project/settings.json')).false;
        expect(matchesUri('*.json', 'webview-panel:/panel/config.json')).false;
        expect(matchesUri('*', 'extension:/some/resource')).false;
        expect(matchesUri('*', 'vscode-workspace-trust:/trust')).false;
    });
});

describe('CustomEditorOpener#isPreviewEnabled', () => {

    class TestableCustomEditorOpener extends CustomEditorOpener {
        override isPreviewEnabled(options?: EditorOpenerOptions): boolean {
            return super.isPreviewEnabled(options);
        }
    }

    function createOpener(enablePreview: boolean): TestableCustomEditorOpener {
        const editor: CustomEditor = {
            viewType: 'test.editor',
            displayName: 'Test Editor',
            selector: [{ filenamePattern: '*.custom' }],
            priority: CustomEditorPriority.default
        };
        const preferenceService = { get: () => enablePreview } as unknown as PreferenceService;
        // Only `preferenceService` is exercised by `isPreviewEnabled`; the other collaborators are unused here.
        return new TestableCustomEditorOpener(editor, undefined!, undefined!, undefined!, preferenceService);
    }

    it('enables preview when requested and the `editor.enablePreview` preference is on', () => {
        expect(createOpener(true).isPreviewEnabled({ preview: true })).true;
    });

    it('disables preview when the `editor.enablePreview` preference is off', () => {
        expect(createOpener(false).isPreviewEnabled({ preview: true })).false;
    });

    it('disables preview when it is not requested', () => {
        const opener = createOpener(true);
        expect(opener.isPreviewEnabled({ preview: false })).false;
        expect(opener.isPreviewEnabled({})).false;
        expect(opener.isPreviewEnabled(undefined)).false;
    });
});
