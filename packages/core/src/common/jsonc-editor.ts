// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import * as jsoncparser from 'jsonc-parser';
import { inject, injectable } from 'inversify';
import { JSONValue } from '@lumino/coreutils';
import { OS } from './os.js';
import { PreferenceService } from './preferences/preference-service.js';

/**
 * Edits the content of JSON with comments, keeping its indentation and line endings.
 *
 * Not bound in the core modules, so that applications that do not edit JSONC do not bundle it.
 * Bind it with `if (!isBound(JSONCEditor)) { bind(JSONCEditor).toSelf().inSingletonScope(); }`.
 */
@injectable()
export class JSONCEditor {
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    setValue(model: string, path: jsoncparser.JSONPath, value: JSONValue): string {
        const edits = this.getEditOperations(model, path, value);
        return jsoncparser.applyEdits(model, edits);
    }

    /**
     * @returns the edits that set the value at the path, or remove it if the value is `undefined`.
     */
    getEditOperations(content: string, path: jsoncparser.JSONPath, value: JSONValue): jsoncparser.Edit[] {
        // Everything is already undefined - no need for changes.
        if (!content.trim() && value === undefined) {
            return [];
        }
        // Delete the entire document.
        if (!path.length && value === undefined) {
            return [{
                offset: 0,
                length: content.length,
                content: ''
            }];
        }
        const { insertSpaces, tabSize } = this.getIndentation(content);
        const jsonCOptions = {
            formattingOptions: {
                insertSpaces,
                tabSize,
                eol: this.getEOL(content)
            }
        };
        return jsoncparser.modify(content, path, value, jsonCOptions);
    }

    /**
     * @returns the indentation of the content if `editor.detectIndentation` is enabled and the content is indented,
     * otherwise the indentation configured in the preferences.
     */
    protected getIndentation(content: string): { insertSpaces: boolean, tabSize: number } {
        const tabSize = this.preferenceService.get('editor.tabSize', { fallback: 4, override: 'json' });
        const insertSpaces = this.preferenceService.get('editor.insertSpaces', { fallback: true, override: 'json' });
        if (this.preferenceService.get('editor.detectIndentation', { fallback: true, override: 'json' })) {
            // The first indented property is a property of the top-level object, so its indentation is one level.
            const indentation = /^([ \t]+)"/m.exec(content)?.[1];
            if (indentation?.startsWith('\t')) {
                return { insertSpaces: false, tabSize };
            } else if (indentation) {
                return { insertSpaces: true, tabSize: indentation.length };
            }
        }
        return { insertSpaces, tabSize };
    }

    /**
     * @returns the line ending used by the content, so that the edits do not mix line endings.
     * For content with a single line, the line ending configured by `files.eol`, or that of the backend's operating system.
     */
    getEOL(content = ''): string {
        const lineBreak = /\r?\n/.exec(content)?.[0];
        if (lineBreak) {
            return lineBreak;
        }
        const eol = this.preferenceService.get('files.eol', { override: 'json' });
        if (eol && typeof eol === 'string' && eol !== 'auto') {
            return eol;
        }
        return OS.backend.EOL;
    }
}
