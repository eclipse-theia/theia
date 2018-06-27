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

import { INITIAL, StackElement, IGrammar } from "monaco-textmate";

export class State implements monaco.languages.IState {

    constructor(
        public ruleStack: StackElement
    ) { }

    clone(): monaco.languages.IState {
        return new State(this.ruleStack);
    }

    equals(other: monaco.languages.IState): boolean {
        return other &&
            (other instanceof State) &&
            (other === this || other.ruleStack === this.ruleStack)
            ;
    }

}

export function createTextmateTokenizer(grammar: IGrammar): monaco.languages.TokensProvider {
    return {
        getInitialState: () => new State(INITIAL),
        tokenize(line: string, state: State) {
            const result = grammar.tokenizeLine(line, state.ruleStack);
            return {
                endState: new State(result.ruleStack),
                tokens: result.tokens.map(token => {
                    const scopes = token.scopes.slice(0);
                    let scope = scopes.pop();

                    // TODO: update this temporary fix once `monaco-editor` supports full scopes arrays
                    while (scope && scope.startsWith('punctuation.')) {
                        scope = scopes.pop();
                    }

                    return {
                        ...token,
                        scopes: scope!,
                    };
                }),
            };
        }
    };
}
