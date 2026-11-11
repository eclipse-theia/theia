// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { expect } from 'chai';
import { Container } from 'inversify';
import { JSONValue } from '@lumino/coreutils';
import { OS } from './os.js';
import { PreferenceService } from './preferences/preference-service.js';
import { JSONCEditor } from './jsonc-editor.js';

describe('JSONCEditor', () => {
    let preferences: Record<string, unknown>;
    let editor: JSONCEditor;

    beforeEach(() => {
        preferences = {};
        const container = new Container();
        container.bind(PreferenceService).toConstantValue({
            get: (name: string, options?: { fallback?: unknown }) => name in preferences ? preferences[name] : options?.fallback
        } as unknown as PreferenceService);
        container.bind(JSONCEditor).toSelf();
        editor = container.get(JSONCEditor);
    });

    it('does not change whitespace-only content when removing a value', () => {
        expect(editor.setValue('\n', ['editor.fontSize'], undefined as unknown as JSONValue)).to.equal('\n');
    });

    it('keeps the indentation of the content', () => {
        const content = '{\n  "editor.fontSize": 20\n}';
        expect(editor.setValue(content, ['editor.tabSize'], 2)).to.equal('{\n  "editor.fontSize": 20,\n  "editor.tabSize": 2\n}');
    });

    it('keeps tab indentation of the content', () => {
        const content = '{\n\t"editor.fontSize": 20\n}';
        expect(editor.setValue(content, ['editor.tabSize'], 2)).to.equal('{\n\t"editor.fontSize": 20,\n\t"editor.tabSize": 2\n}');
    });

    it('uses the configured indentation if the content is not indented', () => {
        preferences['editor.tabSize'] = 2;
        expect(editor.setValue('{}', ['editor.tabSize'], 2)).to.equal(`{${OS.backend.EOL}  "editor.tabSize": 2${OS.backend.EOL}}`);
    });

    it('uses the configured indentation if indentation detection is disabled', () => {
        preferences['editor.detectIndentation'] = false;
        preferences['editor.tabSize'] = 2;
        const content = '{\n\t"editor.fontSize": 20\n}';
        expect(editor.setValue(content, ['editor.tabSize'], 2)).to.contain('\n  "editor.tabSize": 2');
    });

    it('keeps the line ending of the content', () => {
        preferences['files.eol'] = '\n';
        const content = '{\r\n    "editor.fontSize": 20\r\n}';
        expect(editor.setValue(content, ['editor.tabSize'], 2)).to.equal('{\r\n    "editor.fontSize": 20,\r\n    "editor.tabSize": 2\r\n}');
    });

    it('uses the line ending of the backend for content with a single line', () => {
        expect(editor.getEOL('{}')).to.equal(OS.backend.EOL);
    });

    it('uses the configured line ending for content with a single line', () => {
        preferences['files.eol'] = '\r\n';
        expect(editor.getEOL('{}')).to.equal('\r\n');
    });
});
