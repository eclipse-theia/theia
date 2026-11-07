// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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

import { expect } from 'chai';
import { ILogger } from '@theia/core';
import { GrammarDefinition, GrammarDefinitionProvider, TextmateRegistry } from './textmate-registry.js';

class TestableTextmateRegistry extends TextmateRegistry {

    readonly warnings: string[] = [];

    constructor() {
        super();
        (this as unknown as { logger: Partial<ILogger> }).logger = {
            warn: async (message: unknown) => {
                this.warnings.push(String(message));
            }
        };
    }
}

describe('TextmateRegistry', () => {

    let registry: TestableTextmateRegistry;
    let loads: number;

    const provider = (location?: string): GrammarDefinitionProvider => ({
        location,
        getGrammarDefinition: (): Promise<GrammarDefinition> => {
            loads++;
            return Promise.reject(new Error('not available'));
        }
    });

    beforeEach(() => {
        registry = new TestableTextmateRegistry();
        loads = 0;
    });

    it('does not load grammars when a scope is registered twice', () => {
        registry.registerTextmateGrammarScope('source.acme', provider('./a.json'));
        registry.registerTextmateGrammarScope('source.acme', provider('./b.json'));

        expect(loads).to.equal(0);
    });

    it('warns if a provider with another location overrides the scope', () => {
        registry.registerTextmateGrammarScope('source.acme', provider('./a.json'));
        const override = provider('./b.json');
        registry.registerTextmateGrammarScope('source.acme', override);

        expect(registry.warnings).to.have.length(1);
        expect(registry.getProvider('source.acme')).to.equal(override);
    });

    it('does not warn if the same location is registered again', () => {
        registry.registerTextmateGrammarScope('source.acme', provider('./a.json'));
        registry.registerTextmateGrammarScope('source.acme', provider('./a.json'));

        expect(registry.warnings).to.be.empty;
    });

    it('warns if neither provider has a location', () => {
        registry.registerTextmateGrammarScope('source.acme', provider());
        registry.registerTextmateGrammarScope('source.acme', provider());

        expect(registry.warnings).to.have.length(1);
    });
});
