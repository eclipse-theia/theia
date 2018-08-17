/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as Ajv from 'ajv';
import * as parser from 'jsonc-parser';
import { injectable } from 'inversify';
import { Keybinding } from '@theia/core/lib/browser';

export const keymapsSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            keybinding: {
                type: 'string'
            },
            command: {
                type: 'string'
            },
            context: {
                type: 'string'
            }
        },
        required: ['command', 'keybinding'],
        optional: ['context'],
        additionalProperties: false
    }
};

@injectable()
export class KeymapsParser {

    protected readonly validate: Ajv.ValidateFunction;

    constructor() {
        // https://github.com/epoberezkin/ajv#options
        this.validate = new Ajv({
            jsonPointers: true
        }).compile(keymapsSchema);
    }

    parse(content: string, errors?: string[]): Keybinding[] {
        const strippedContent = parser.stripComments(content);
        const parsingErrors: parser.ParseError[] | undefined = errors ? [] : undefined;
        const bindings = parser.parse(strippedContent, parsingErrors);
        if (parsingErrors && errors) {
            for (const error of parsingErrors) {
                errors.push(`${parser.ParseErrorCode[error.error]} at ${error.offset} offset of ${error.length} length`);
            }
        }
        if (this.validate(bindings)) {
            return bindings;
        }
        if (errors && this.validate.errors) {
            for (const error of this.validate.errors) {
                errors.push(`${error.message} at ${error.dataPath}`);
            }
        }
        return [];
    }

}
