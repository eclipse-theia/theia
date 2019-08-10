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
            },
            when: {
                type: 'string'
            },
            args: {}
        },
        required: ['command', 'keybinding'],
        optional: ['context', 'when', 'args'],
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
                errors.push(`${this.printParseErrorCode(error.error)} at ${error.offset} offset of ${error.length} length`);
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

    // https://github.com/Microsoft/node-jsonc-parser/issues/13
    // tslint:disable-next-line:typedef
    protected printParseErrorCode(code: number | undefined) {
        switch (code) {
            case parser.ParseErrorCode.InvalidSymbol: return 'InvalidSymbol';
            case parser.ParseErrorCode.InvalidNumberFormat: return 'InvalidNumberFormat';
            case parser.ParseErrorCode.PropertyNameExpected: return 'PropertyNameExpected';
            case parser.ParseErrorCode.ValueExpected: return 'ValueExpected';
            case parser.ParseErrorCode.ColonExpected: return 'ColonExpected';
            case parser.ParseErrorCode.CommaExpected: return 'CommaExpected';
            case parser.ParseErrorCode.CloseBraceExpected: return 'CloseBraceExpected';
            case parser.ParseErrorCode.CloseBracketExpected: return 'CloseBracketExpected';
            case parser.ParseErrorCode.EndOfFileExpected: return 'EndOfFileExpected';
            case parser.ParseErrorCode.InvalidCommentToken: return 'InvalidCommentToken';
            case parser.ParseErrorCode.UnexpectedEndOfComment: return 'UnexpectedEndOfComment';
            case parser.ParseErrorCode.UnexpectedEndOfString: return 'UnexpectedEndOfString';
            case parser.ParseErrorCode.UnexpectedEndOfNumber: return 'UnexpectedEndOfNumber';
            case parser.ParseErrorCode.InvalidUnicode: return 'InvalidUnicode';
            case parser.ParseErrorCode.InvalidEscapeCharacter: return 'InvalidEscapeCharacter';
            case parser.ParseErrorCode.InvalidCharacter: return 'InvalidCharacter';
        }
        return '<unknown ParseErrorCode>';
    }

}
