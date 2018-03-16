/**
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Keybinding } from "@theia/core/lib/browser";
import * as jsoncparser from "jsonc-parser";
import * as ajv from 'ajv';

export class ValidationError extends Error {
    messages: string[] = [];
}

export const keymapsSchema = {
    type: "array",
    items: {
        type: "object",
        properties: {
            keybinding: {
                type: "string"
            },
            command: {
                type: "string"
            },
            context: {
                type: "string"
            },
        },
        required: ["command", "keybinding"],
        optional: ["context"],
        additionalProperties: false,
    }
};

export const keymapsValidator = new ajv({ // https://github.com/epoberezkin/ajv#options
    jsonPointers: true
}).compile(keymapsSchema);

/**
 * Returns clean bindings read from a text file.
 * In case a problem happens, throws a list of error messages.
 *
 * @param content the raw text defining the keybindings
 */
export default function parseKeybindings(content: string): Keybinding[] {
    const strippedContent = jsoncparser.stripComments(content);
    const validationError = new ValidationError('Content validation error.');

    // parse the raw content
    const errors: jsoncparser.ParseError[] = [];
    const rawBindings = jsoncparser.parse(strippedContent, errors);
    if (errors.length) {
        for (const error of errors) {
            validationError.messages.push(JSON.stringify(error));
        }
        throw validationError;
    }

    // validate the parsed object
    if (rawBindings) {
        if (keymapsValidator(rawBindings)) {
            return rawBindings;

        } else {
            for (const error of keymapsValidator.errors!) {
                validationError.messages.push(`${error.message} (${error.dataPath})`);
            }
            throw validationError;
        }
    }

    return [];
}
