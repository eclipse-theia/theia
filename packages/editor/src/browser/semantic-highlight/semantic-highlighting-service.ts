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

import { inject, injectable } from 'inversify';
import { decode as base64Decode, encode as base64Encode } from 'base64-arraybuffer';
import { Position, Range } from 'vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ILogger } from '@theia/core/lib/common/logger';
import { ILanguageClient } from '@theia/languages/lib/browser/language-client-services';
import { SemanticHighlightFeature } from '@theia/languages/lib/browser/semantic-highlighting/semantic-highlighting-feature';
import { SemanticHighlightingParams } from '@theia/languages/lib/browser/semantic-highlighting/semantic-highlighting-protocol';

/**
 * Service for registering and managing semantic highlighting decorations in the code editors for multiple languages.
 *
 * The current, default implementation does nothing at all, because the unique identifier of the `EditorDecoration` is not
 * exposed via the API. A working example is available as the `MonacoSemanticHighlightingService` from the `@theia/monaco` extension.
 */
@injectable()
export class SemanticHighlightingService implements Disposable {

    @inject(ILogger)
    protected readonly logger: ILogger;
    protected readonly scopes: Map<string, string[][]> = new Map();

    /**
     * Registers the supported highlighting scopes for the given language. Returns with a disposable that will unregister the scopes from this service on `dispose`.
     * @param languageId the unique identifier of the language.
     * @param scopes a lookup table of the supported (TextMate) scopes received from the server. Semantic highlighting will be be supported for a language if the `scopes` is empty.
     */
    register(languageId: string, scopes: string[][] | undefined): Disposable {
        if (scopes && scopes.length > 0) {
            this.logger.info(`Registering scopes for language: ${languageId}.`);
            if (this.scopes.has(languageId)) {
                this.logger.warn(`The scopes are already registered for language: ${languageId}.`);
            }
            this.scopes.set(languageId, scopes.map(scope => scope.slice(0)));
            this.logger.info(`The scopes have been successfully registered for ${languageId}.`);
            const unregister: (id: string) => void = this.unregister.bind(this);
            return Disposable.create(() => unregister(languageId));
        }
        return Disposable.NULL;
    }

    protected unregister(languageId: string): void {
        this.logger.info(`Unregistering scopes for language: ${languageId}.`);
        if (!this.scopes.has(languageId)) {
            this.logger.warn(`No scopes were registered for language: ${languageId}.`);
        }
        this.scopes.delete(languageId);
        this.logger.info(`The scopes have been successfully unregistered for ${languageId}.`);
    }

    /**
     * An array for TextMate scopes for the language.
     * @param languageId the unique ID of the language.
     * @param index the index of the TextMate scopes for the language.
     */
    protected scopesFor(languageId: string, index: number): string[] {
        if (index < 0) {
            throw new Error(`index >= 0. ${index}`);
        }
        const scopes = this.scopes.get(languageId);
        if (!scopes) {
            throw new Error(`No scopes were registered for language: ${languageId}.`);
        }
        if (scopes.length <= index) {
            throw new Error(`Cannot find scopes by index. Language ID: ${languageId}. Index: ${index}. Scopes: ${scopes}`);
        }
        return scopes[index];
    }

    /**
     * Decorates the editor with the semantic highlighting scopes.
     * @param languageId the unique identifier of the language the resource belongs to.
     * @param uri the URI of the resource to decorate in the editor.
     * @param ranges the decoration ranges.
     */
    async decorate(languageId: string, uri: URI, ranges: SemanticHighlightingRange[]): Promise<void> {
        // NOOP
    }

    /**
     * Disposes the service.
     */
    dispose(): void {
        // NOOP
    }

}

export namespace SemanticHighlightingService {

    const LENGTH_SHIFT = 0x0000010;
    const SCOPE_MASK = 0x000FFFF;

    /**
     * The bare minimum representation of an individual semantic highlighting token.
     */
    export interface Token {

        /**
         * The offset of the token.
         */
        readonly character: number;

        /**
         * The length of the token.
         */
        readonly length: number;

        /**
         * The unique scope index per language.
         */
        readonly scope: number;
    }

    export namespace Token {

        export function fromArray(tokens: number[]): Token[] {
            if (tokens.length % 3 !== 0) {
                throw new Error(`"Invalid tokens. 'tokens.length % 3 !== 0' Tokens length was: " + ${tokens.length}.`);
            }
            const result: Token[] = [];
            for (let i = 0; i < tokens.length; i = i + 3) {
                result.push({
                    character: tokens[i],
                    length: tokens[i + 1],
                    scope: tokens[i + 2]
                });
            }
            return result;
        }

    }

    /**
     * Converts the compact, `base64` string token into an array of tokens.
     */
    export function decode(tokens: string | undefined): SemanticHighlightingService.Token[] {
        if (!tokens) {
            return [];
        }

        const buffer = base64Decode(tokens);
        const dataView = new DataView(buffer);
        const result: SemanticHighlightingService.Token[] = [];

        for (let i = 0; i < buffer.byteLength / Uint32Array.BYTES_PER_ELEMENT; i = i + 2) {
            const character = dataView.getUint32(i * Uint32Array.BYTES_PER_ELEMENT);
            const lengthAndScope = dataView.getUint32((i + 1) * Uint32Array.BYTES_PER_ELEMENT);
            const length = lengthAndScope >>> LENGTH_SHIFT;
            const scope = lengthAndScope & SCOPE_MASK;
            result.push({
                character,
                length,
                scope
            });
        }
        return result;
    }

    /**
     * Encodes the array of tokens into a compact `base64` string representation.
     */
    export function encode(tokens: SemanticHighlightingService.Token[] | undefined): string {
        if (!tokens || tokens.length === 0) {
            return '';
        }

        const buffer = new ArrayBuffer(tokens.length * 2 * Uint32Array.BYTES_PER_ELEMENT);
        const dataView = new DataView(buffer);
        let j = 0;

        for (let i = 0; i < tokens.length; i++) {
            const { character, length, scope } = tokens[i];
            let lengthAndScope = length;
            lengthAndScope = lengthAndScope << LENGTH_SHIFT;
            lengthAndScope |= scope;
            dataView.setUint32(j++ * Uint32Array.BYTES_PER_ELEMENT, character);
            dataView.setUint32(j++ * Uint32Array.BYTES_PER_ELEMENT, lengthAndScope);
        }
        return base64Encode(buffer);
    }

    /**
     * Creates a new text document feature to handle the semantic highlighting capabilities of the protocol.
     * When the feature gets initialized, it delegates to the semantic highlighting service and registers the TextMate scopes received as part of the server capabilities.
     * Plus, each time when a notification is received by the client, the semantic highlighting service will be used as the consumer and the highlighting information
     * will be used to decorate the text editor.
     */
    export function createNewFeature(service: SemanticHighlightingService, client: ILanguageClient & Readonly<{ languageId: string }>): SemanticHighlightFeature {
        const { languageId } = client;
        const initializeCallback = (id: string, scopes: string[][]): Disposable => service.register(id, scopes);
        const consumer = (params: SemanticHighlightingParams): void => {
            const toRanges: (tuple: [number, string | undefined]) => SemanticHighlightingRange[] = tuple => {
                const [line, tokens] = tuple;
                if (!tokens) {
                    return [
                        {
                            start: Position.create(line, 0),
                            end: Position.create(line, 0),
                        }
                    ];
                }
                return SemanticHighlightingService.decode(tokens).map(token => ({
                    start: Position.create(line, token.character),
                    end: Position.create(line, token.character + token.length),
                    scope: token.scope
                }));
            };
            const ranges = params.lines.map(line => [line.line, line.tokens]).map(toRanges).reduce((acc, current) => acc.concat(current), []);
            const uri = new URI(params.textDocument.uri);
            service.decorate(languageId, uri, ranges);
        };
        return new SemanticHighlightFeature(client, initializeCallback, consumer);
    }

}

export interface SemanticHighlightingRange extends Range {
    /**
     * The unique, internal index of the TextMate scope for the range.
     */
    readonly scope?: number;
}

export { Position, Range };
