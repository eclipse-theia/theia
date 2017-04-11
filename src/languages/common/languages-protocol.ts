import { DocumentSelector } from 'vscode-languageserver/lib/protocol';
import { RequestType } from 'vscode-jsonrpc';

export const LANGUAGES_WS_PATH = '/languages';

export type FileEventDescription = string | {
    globPattern: string;
    ignoreCreateEvents?: boolean;
    ignoreChangeEvents?: boolean;
    ignoreDeleteEvents?: boolean;
};

export interface LanguageDescription {
    id: string;
    name?: string;
    documentSelector?: DocumentSelector;
    fileEvents?: FileEventDescription[];
}

export interface LanguageIdentifier {
    path: string; // FIXME replace path with uri
    description: LanguageDescription;
}

export namespace LanguageIdentifier {
    export function create(description: LanguageDescription) {
        return {
            path: LANGUAGES_WS_PATH + '/' + description.id,
            description
        }
    }
}

export interface LanguagesResult {
    languages: LanguageIdentifier[]
}

export namespace GetLanguagesRequest {
    export const type = new RequestType<{}, LanguagesResult, void, void>('languages/getLanguages');
}