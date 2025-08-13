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
import { inject, injectable } from '@theia/core/shared/inversify';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { isWindows, PreferenceService } from '@theia/core';

@injectable()
export class JSONCEditor {
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    setValue(model: string, path: jsoncparser.JSONPath, value: JSONValue): string {
        const edits = this.getEditOperations(model, path, value);
        return jsoncparser.applyEdits(model, edits);
    }

    protected getEditOperations(content: string, path: jsoncparser.JSONPath, value: JSONValue): jsoncparser.Edit[] {
        // Everything is already undefined - no need for changes.
        if (!content && value === undefined) {
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
        const tabSize = this.preferenceService.get('[json].editor.tabSize', 4);
        const insertSpaces = this.preferenceService.get('[json].editor.insertSpaces', true);

        const jsonCOptions = {
            formattingOptions: {
                insertSpaces,
                tabSize,
                eol: this.getEOL()
            }
        };
        return jsoncparser.modify(content, path, value, jsonCOptions);
    }

    getEOL(): string {
        const eol = this.preferenceService.get('[json].files.eol');
        if (eol && typeof eol === 'string' && eol !== 'auto') {
            return eol;
        }
        return isWindows ? '\r\n' : '\n';
    }
}
