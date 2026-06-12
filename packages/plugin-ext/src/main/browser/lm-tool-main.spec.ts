// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { LanguageModelToolsMainImpl } from './lm-tool-main';
import {
    ToolResultTextPartDto,
    ToolResultDataPartDto,
    ToolResultPromptTsxPartDto,
    ToolResultUnknownPartDto,
    ToolResultPartDto,
} from '../../common/lm-tool-protocol';
import { ToolCallContentResult } from '@theia/ai-core/lib/common/language-model';

// Access private methods for testing
interface LmToolMainInternals {
    convertDtoToToolCallResult(part: ToolResultPartDto): ToolCallContentResult;
    convertDataPart(base64: string, mimeType: string): ToolCallContentResult;
}

function createInstance(): LmToolMainInternals {
    const impl = Object.create(LanguageModelToolsMainImpl.prototype) as LanguageModelToolsMainImpl;
    return impl as unknown as LmToolMainInternals;
}

describe('LanguageModelToolsMainImpl - DTO to ToolCallContentResult conversion', () => {
    let instance: LmToolMainInternals;

    beforeEach(() => {
        instance = createInstance();
    });

    describe('convertDtoToToolCallResult', () => {
        it('should convert text part DTO to ToolCallTextResult', () => {
            const part: ToolResultTextPartDto = { type: 'text', value: 'hello world' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'text', text: 'hello world' });
        });

        it('should convert prompt-tsx part DTO to ToolCallTextResult with JSON', () => {
            const part: ToolResultPromptTsxPartDto = { type: 'prompt-tsx', value: { foo: 'bar' } };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'text', text: '{"foo":"bar"}' });
        });

        it('should convert unknown part DTO to ToolCallTextResult', () => {
            const part: ToolResultUnknownPartDto = { type: 'unknown', json: '{"custom":"data"}' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'text', text: '{"custom":"data"}' });
        });

        it('should convert data part with image mimeType to ToolCallImageResult', () => {
            const base64 = btoa('fake-image-data');
            const part: ToolResultDataPartDto = { type: 'data', base64, mimeType: 'image/png' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'image', base64data: base64, mimeType: 'image/png' });
        });

        it('should convert data part with audio mimeType to ToolCallAudioResult', () => {
            const base64 = btoa('fake-audio-data');
            const part: ToolResultDataPartDto = { type: 'data', base64, mimeType: 'audio/mp3' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'audio', data: base64, mimeType: 'audio/mp3' });
        });

        it('should convert data part with text/plain mimeType to ToolCallTextResult', () => {
            const base64 = btoa('plain text content');
            const part: ToolResultDataPartDto = { type: 'data', base64, mimeType: 'text/plain' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'text', text: 'plain text content' });
        });

        it('should convert data part with application/json mimeType to ToolCallTextResult', () => {
            const jsonString = '{"key":"value"}';
            const base64 = btoa(jsonString);
            const part: ToolResultDataPartDto = { type: 'data', base64, mimeType: 'application/json' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'text', text: jsonString });
        });

        it('should convert data part with text/x-json mimeType to ToolCallTextResult', () => {
            const jsonString = '{"data":123}';
            const base64 = btoa(jsonString);
            const part: ToolResultDataPartDto = { type: 'data', base64, mimeType: 'text/x-json' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'text', text: jsonString });
        });

        it('should convert data part with image/jpeg mimeType to ToolCallImageResult', () => {
            const base64 = btoa('jpeg-data');
            const part: ToolResultDataPartDto = { type: 'data', base64, mimeType: 'image/jpeg' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'image', base64data: base64, mimeType: 'image/jpeg' });
        });

        it('should convert data part with audio/wav mimeType to ToolCallAudioResult', () => {
            const base64 = btoa('wav-data');
            const part: ToolResultDataPartDto = { type: 'data', base64, mimeType: 'audio/wav' };
            const result = instance.convertDtoToToolCallResult(part);
            expect(result).to.deep.equal({ type: 'audio', data: base64, mimeType: 'audio/wav' });
        });
    });
});
