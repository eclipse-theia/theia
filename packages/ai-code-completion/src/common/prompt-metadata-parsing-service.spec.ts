// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import 'reflect-metadata';
import { expect } from 'chai';
import { CodeCompletionPromptMetaData, DefaultCodeCompletionPromptParserService } from './prompt-metadata-parsing-service';

describe('DefaultCodeCompletionPromptParserService', () => {
    let parserService: DefaultCodeCompletionPromptParserService;

    beforeEach(() => {
        parserService = new DefaultCodeCompletionPromptParserService();
    });

    it('should parse valid metadata with requestSettings and return the modified prompt', () => {
        const input = `---
requestSettings:
  max_new_tokens: 2024
  stop: ['<|im_end|>']
---
Some other content.`;
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: {
                requestSettings: {
                    max_new_tokens: 2024,
                    stop: ['<|im_end|>']
                }
            },
            prompt: 'Some other content.'
        });
    });

    it('should return undefined metadata and original prompt if metadata does not start on the first line', () => {
        const input = `
---
requestSettings:
  max_new_tokens: 2024
---
Some other content.`;
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: undefined,
            prompt: input
        });
    });

    it('should return undefined metadata and original prompt if metadata is not closed correctly', () => {
        const input = `---
requestSettings:
  max_new_tokens: 2024
Some other content.`;
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: undefined,
            prompt: input
        });
    });

    it('should return undefined metadata and original prompt if metadata is invalid YAML', () => {
        const input = `---
requestSettings:
  max_new_tokens: 2024
  stop: ['<|im_end|>
---
Some other content.`;
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: undefined,
            prompt: input
        });
    });

    it('should return undefined metadata and original prompt if there is no metadata', () => {
        const input = 'Some other content.';
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: undefined,
            prompt: input
        });
    });

    it('should return undefined metadata and original prompt for valid but empty metadata', () => {
        const input = `---
---
Some other content.`;
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: undefined,
            prompt: input
        });
    });

    it('should return undefined metadata and original prompt if metadata contains non-object content', () => {
        const input = `---
- some
- list
---
Some other content.`;
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: undefined,
            prompt: input
        });
    });

    it('should correctly handle metadata followed by an empty prompt', () => {
        const input = `---
requestSettings:
  max_new_tokens: 2024
---
`;
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: {
                requestSettings: {
                    max_new_tokens: 2024
                }
            },
            prompt: ''
        });
    });

    it('should correctly handle a prompt with no content after valid metadata', () => {
        const input = `---
requestSettings:
  max_new_tokens: 2024
---`;
        const result = parserService.parse(input);
        expect(result).to.deep.equal({
            metadata: {
                requestSettings: {
                    max_new_tokens: 2024
                }
            },
            prompt: ''
        });
    });
});
describe('CodeCompletionPromptMetaData', () => {
    it('should return true for a valid metadata object with requestSettings', () => {
        const validObject = {
            requestSettings: { key1: 'value1', key2: 42 },
        };
        expect(CodeCompletionPromptMetaData.isStrict(validObject)).to.be.true;
    });

    it('should return true for a valid metadata object without requestSettings', () => {
        const validObject = {};
        expect(CodeCompletionPromptMetaData.isStrict(validObject)).to.be.true;
    });

    it('should return false for an object with additional unknown properties', () => {
        const invalidObject = {
            requestSettings: { key1: 'value1' },
            extraKey: 'unexpected',
        };
        expect(CodeCompletionPromptMetaData.isStrict(invalidObject)).to.be.false;
    });

    it('should return false for an object where requestSettings is not an object', () => {
        const invalidObject = {
            requestSettings: 'invalid',
        };
        expect(CodeCompletionPromptMetaData.isStrict(invalidObject)).to.be.false;
    });

    it('should return false for an object where requestSettings is null', () => {
        const invalidObject = {
            // eslint-disable-next-line no-null/no-null
            requestSettings: null,
        };
        expect(CodeCompletionPromptMetaData.isStrict(invalidObject)).to.be.false;
    });

    it('should return false for an object where requestSettings is an array', () => {
        const invalidObject = {
            requestSettings: ['invalid'],
        };
        expect(CodeCompletionPromptMetaData.isStrict(invalidObject)).to.be.false;
    });

    it('should return false for null', () => {
        // eslint-disable-next-line no-null/no-null
        expect(CodeCompletionPromptMetaData.isStrict(null)).to.be.false;
    });

    it('should return false for undefined', () => {
        expect(CodeCompletionPromptMetaData.isStrict(undefined)).to.be.false;
    });

    it('should return false for a number', () => {
        expect(CodeCompletionPromptMetaData.isStrict(42)).to.be.false;
    });

    it('should return false for a string', () => {
        expect(CodeCompletionPromptMetaData.isStrict('string')).to.be.false;
    });

    it('should return false for an array', () => {
        expect(CodeCompletionPromptMetaData.isStrict([])).to.be.false;
    });

    it('should return false for an object wit only unknown properties', () => {
        const invalidObject = {
            unknownKey: 'invalid',
        };
        expect(CodeCompletionPromptMetaData.isStrict(invalidObject)).to.be.false;
    });

});
