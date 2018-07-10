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
            const tokenTheme = monaco.services.StaticServices.standaloneThemeService.get().getTheme().tokenTheme;
            const defaultResult = tokenTheme.match(undefined, 'should.return.default');
            const defaultForeground = monaco.modes.TokenMetadata.getForeground(defaultResult);
            return {
                endState: new State(result.ruleStack),
                tokens: result.tokens.map(token => {
                    const scopes = token.scopes.slice(0);

                    // TODO monaco doesn't allow to pass multiple scopes and have their styles merged yet. See https://github.com/Microsoft/monaco-editor/issues/929
                    // As a workaround we go through the scopes backwards and pick the first for which the tokenTheme has a special foreground color.
                    for (let i = scopes.length - 1; i >= 0; i--) {
                        const scope = scopes[i];
                        const match = tokenTheme.match(undefined, scope);
                        const foregroundColor = monaco.modes.TokenMetadata.getForeground(match);
                        if (defaultForeground !== foregroundColor) {
                            return {
                                ...token,
                                scopes: scope!
                            };
                        }
                    }
                    return {
                        ...token,
                        scopes: scopes[0]!,
                    };
                }),
            };
        }
    };
}
