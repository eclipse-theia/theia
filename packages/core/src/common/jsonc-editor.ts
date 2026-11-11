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

export const JSONCEditor = Symbol('JSONCEditor');
/**
 * Edits the content of JSON with comments, keeping its indentation and line endings.
 */
export interface JSONCEditor {
    /**
     * @param formattingOptions the options to use instead of the ones detected from the content or configured in the preferences.
     * @returns the content with the value at the path set, or removed if the value is `undefined`.
     */
    setValue(content: string, path: jsoncparser.JSONPath, value: JSONValue, formattingOptions?: Partial<jsoncparser.FormattingOptions>): string;
    /**
     * @param formattingOptions the options to use instead of the ones detected from the content or configured in the preferences.
     * @returns the edits that set the value at the path, or remove it if the value is `undefined`.
     */
    getEditOperations(content: string, path: jsoncparser.JSONPath, value: JSONValue, formattingOptions?: Partial<jsoncparser.FormattingOptions>): jsoncparser.Edit[];
    /**
     * @returns the line ending used by the content, so that the edits do not mix line endings.
     * For content with a single line, the line ending configured by `files.eol`, or that of the backend's operating system.
     */
    getEOL(content?: string): string;
}

@injectable()
export class JSONCEditorImpl implements JSONCEditor {
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    setValue(content: string, path: jsoncparser.JSONPath, value: JSONValue, formattingOptions?: Partial<jsoncparser.FormattingOptions>): string {
        const edits = this.getEditOperations(content, path, value, formattingOptions);
        return jsoncparser.applyEdits(content, edits);
    }

    getEditOperations(content: string, path: jsoncparser.JSONPath, value: JSONValue, formattingOptions?: Partial<jsoncparser.FormattingOptions>): jsoncparser.Edit[] {
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
        const jsonCOptions = {
            formattingOptions: {
                ...this.getIndentation(content),
                eol: this.getEOL(content),
                ...formattingOptions
            }
        };
        return jsoncparser.modify(content, path, value, jsonCOptions);
    }

    /**
     * @returns the indentation of the content if `editor.detectIndentation` is enabled and the content is indented,
     * otherwise the indentation configured in the preferences.
     */
    protected getIndentation(content: string): { insertSpaces: boolean, tabSize: number } {
        const tabSize = this.preferenceService.get('editor.tabSize', { fallback: 4, override: 'jsonc' });
        const insertSpaces = this.preferenceService.get('editor.insertSpaces', { fallback: true, override: 'jsonc' });
        if (this.preferenceService.get('editor.detectIndentation', { fallback: true, override: 'jsonc' })) {
            const indentation = this.detectIndentation(content);
            if (indentation?.startsWith('\t')) {
                return { insertSpaces: false, tabSize };
            } else if (indentation) {
                return { insertSpaces: true, tabSize: indentation.length };
            }
        }
        return { insertSpaces, tabSize };
    }

    /**
     * @returns the whitespace before the first property or element of the root, which is one level of indentation,
     * or `undefined` if it does not start its own line.
     */
    protected detectIndentation(content: string): string | undefined {
        const child = jsoncparser.parseTree(content)?.children?.[0];
        if (child) {
            const lineStart = content.lastIndexOf('\n', child.offset) + 1;
            const indentation = content.substring(lineStart, child.offset);
            if (/^[ \t]+$/.test(indentation)) {
                return indentation;
            }
        }
        return undefined;
    }

    getEOL(content = ''): string {
        const lineBreak = /\r?\n/.exec(content)?.[0];
        if (lineBreak) {
            return lineBreak;
        }
        const eol = this.preferenceService.get('files.eol', { override: 'jsonc' });
        if (eol && typeof eol === 'string' && eol !== 'auto') {
            return eol;
        }
        return OS.backend.EOL;
    }
}
