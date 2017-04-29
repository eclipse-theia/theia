/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { DocumentSelector } from 'vscode-languageserver/lib/protocol';

export const LANGUAGES_PATH = '/languages';

export const LanguagesService = Symbol("LanguagesService");

export interface LanguagesService {
    getLanguages(): Promise<LanguageIdentifier[]>
}

export interface LanguageIdentifier {
    path: string; // FIXME replace path with uri
    description: LanguageDescription;
}

export namespace LanguageIdentifier {
    export function create(description: LanguageDescription) {
        return {
            path: LANGUAGES_PATH + '/' + description.id,
            description
        }
    }
}

export interface LanguageDescription {
    id: string;
    name?: string;
    documentSelector?: DocumentSelector;
    fileEvents?: FileEventDescription[];
}

export type FileEventDescription = string | {
    globPattern: string;
    ignoreCreateEvents?: boolean;
    ignoreChangeEvents?: boolean;
    ignoreDeleteEvents?: boolean;
}
