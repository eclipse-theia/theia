/**
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
