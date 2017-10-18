/*
 * Copyright (C) 2017 Ericson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from "inversify";
const Globalize = require("globalize");
const localeRequire = require("../i18n/locale.json");

@injectable()
export class MessageTranslation {

    constructor() {

    }

    static localize(selection: string, defaultSelection: string): string {
        try {
            return Globalize.formatMessage(selection);
        } catch (Error) {
            // If the language definition is not found, use the default selection string
            console.log("----- using default value for: " + selection + " to be " + defaultSelection);
            return defaultSelection;
        }
    }

    // Load data translated for a specific package
    static setLocaleData(data: object) {
        Globalize.loadMessages(data);
    }

    // Read the locale set in the file: locale.json
    static getLocale(): string {
        return localeRequire.locale;
    }

    static setLocale(lang: string) {
        try {
            Globalize.locale(lang);
        } catch (Error) {
            console.log("setLocale() Error: " + Error);
        }
    }
}
