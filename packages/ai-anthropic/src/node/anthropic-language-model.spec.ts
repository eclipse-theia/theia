// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { AnthropicModel, DEFAULT_MAX_TOKENS } from './anthropic-language-model';

describe('AnthropicModel', () => {

    describe('constructor', () => {
        it('should set default maxRetries to 3 when not provided', () => {
            const model = new AnthropicModel(
                'test-id',
                'claude-3-opus-20240229',
                true,
                true,
                () => 'test-api-key',
                DEFAULT_MAX_TOKENS
            );

            expect(model.maxRetries).to.equal(3);
        });

        it('should set custom maxRetries when provided', () => {
            const customMaxRetries = 5;
            const model = new AnthropicModel(
                'test-id',
                'claude-3-opus-20240229',
                true,
                true,
                () => 'test-api-key',
                DEFAULT_MAX_TOKENS,
                customMaxRetries
            );

            expect(model.maxRetries).to.equal(customMaxRetries);
        });

        it('should preserve all other constructor parameters', () => {
            const model = new AnthropicModel(
                'test-id',
                'claude-3-opus-20240229',
                true,
                true,
                () => 'test-api-key',
                DEFAULT_MAX_TOKENS,
                5
            );

            expect(model.id).to.equal('test-id');
            expect(model.model).to.equal('claude-3-opus-20240229');
            expect(model.enableStreaming).to.be.true;
            expect(model.maxTokens).to.equal(DEFAULT_MAX_TOKENS);
            expect(model.maxRetries).to.equal(5);
        });
    });
});
