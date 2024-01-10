// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { INITIAL, IGrammar, StateStack } from 'vscode-textmate';
import * as monaco from '@theia/monaco-editor-core';

export class TokenizerState implements monaco.languages.IState {

    constructor(
        public readonly stateStack: StateStack
    ) { }

    clone(): monaco.languages.IState {
        return new TokenizerState(this.stateStack);
    }

    equals(other: monaco.languages.IState): boolean {
        return other instanceof TokenizerState && (other === this || other.stateStack === this.stateStack);
    }

}

/**
 * Options for the TextMate tokenizer.
 */
export interface TokenizerOption {

    /**
     * Maximum line length that will be handled by the TextMate tokenizer. If the length of the actual line exceeds this
     * limit, the tokenizer terminates and the tokenization of any subsequent lines might be broken.
     *
     * If the `lineLimit` is not defined, it means, there are no line length limits. Otherwise, it must be a positive
     * integer or an error will be thrown.
     */
    lineLimit?: number;

}

export function createTextmateTokenizer(grammar: IGrammar, options: TokenizerOption): monaco.languages.EncodedTokensProvider & monaco.languages.TokensProvider {
    if (options.lineLimit !== undefined && (options.lineLimit <= 0 || !Number.isInteger(options.lineLimit))) {
        throw new Error(`The 'lineLimit' must be a positive integer. It was ${options.lineLimit}.`);
    }
    return {
        getInitialState: () => new TokenizerState(INITIAL),
        tokenizeEncoded(line: string, state: TokenizerState): monaco.languages.IEncodedLineTokens {
            if (options.lineLimit !== undefined && line.length > options.lineLimit) {
                // Skip tokenizing the line if it exceeds the line limit.
                return { endState: state.stateStack, tokens: new Uint32Array() };
            }
            const result = grammar.tokenizeLine2(line, state.stateStack, 500);
            return {
                endState: new TokenizerState(result.ruleStack),
                tokens: result.tokens
            };
        },
        tokenize(line: string, state: TokenizerState): monaco.languages.ILineTokens {
            if (options.lineLimit !== undefined && line.length > options.lineLimit) {
                // Skip tokenizing the line if it exceeds the line limit.
                return { endState: state.stateStack, tokens: [] };
            }
            const result = grammar.tokenizeLine(line, state.stateStack, 500);
            return {
                endState: new TokenizerState(result.ruleStack),
                tokens: result.tokens.map(t => ({
                    startIndex: t.startIndex,
                    scopes: t.scopes.reverse().join(' ')
                }))
            };
        }
    };
}
