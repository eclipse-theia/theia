/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { INITIAL, StackElement, IGrammar } from 'monaco-textmate';

export class TokenizerState implements monaco.languages.IState {

    constructor(
        public readonly ruleStack: StackElement
    ) { }

    clone(): monaco.languages.IState {
        return new TokenizerState(this.ruleStack);
    }

    equals(other: monaco.languages.IState): boolean {
        return other instanceof TokenizerState && (other === this || other.ruleStack === this.ruleStack);
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
    readonly lineLimit?: number;

}

export namespace TokenizerOption {
    /**
     * The default TextMate tokenizer option.
     */
    export const DEFAULT: TokenizerOption = {
        lineLimit: 400
    };
}

export function createTextmateTokenizer(grammar: IGrammar, options: TokenizerOption): monaco.languages.EncodedTokensProvider {
    if (options.lineLimit !== undefined && (options.lineLimit <= 0 || !Number.isInteger(options.lineLimit))) {
        throw new Error(`The 'lineLimit' must be a positive integer. It was ${options.lineLimit}.`);
    }
    return {
        getInitialState: () => new TokenizerState(INITIAL),
        tokenizeEncoded(line: string, state: TokenizerState) {
            let processedLine = line;
            if (options.lineLimit !== undefined && line.length > options.lineLimit) {
                // Line is too long to be tokenized
                processedLine = line.substr(0, options.lineLimit);
            }
            const result = grammar.tokenizeLine2(processedLine, state.ruleStack);
            return {
                endState: new TokenizerState(result.ruleStack),
                tokens: result.tokens
            };
        }
    };
}
