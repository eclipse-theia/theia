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
import { LanguageModelToolsExtImpl } from './lm-tool-ext';
import { ToolResultPartDto, uint8ArrayToBase64 } from '../common/lm-tool-protocol';

// Access private methods for testing
interface LmToolExtInternals {
    convertPartToDto(part: unknown): ToolResultPartDto;
    isTextPart(part: unknown): boolean;
    isDataPart(part: unknown): boolean;
    isPromptTsxPart(part: unknown): boolean;
}

function createInstance(): LmToolExtInternals {
    const impl = Object.create(LanguageModelToolsExtImpl.prototype) as LanguageModelToolsExtImpl;
    return impl as unknown as LmToolExtInternals;
}

describe('LanguageModelToolsExtImpl - Part to DTO conversion', () => {
    let instance: LmToolExtInternals;

    beforeEach(() => {
        instance = createInstance();
    });

    describe('isTextPart', () => {
        it('should return true for a text part with string value', () => {
            expect(instance.isTextPart({ value: 'hello' })).to.be.true;
        });

        it('should return false for a data part (has data and mimeType)', () => {
            expect(instance.isTextPart({ data: new Uint8Array([1, 2]), mimeType: 'text/plain' })).to.be.false;
        });

        it('should return false for a non-string value', () => {
            expect(instance.isTextPart({ value: { foo: 'bar' } })).to.be.false;
        });

        it('should return false for undefined', () => {
            expect(instance.isTextPart(undefined)).to.be.false;
        });
    });

    describe('isDataPart', () => {
        it('should return true for a data part', () => {
            expect(instance.isDataPart({ data: new Uint8Array([1, 2]), mimeType: 'image/png' })).to.be.true;
        });

        it('should return false for a text part', () => {
            expect(instance.isDataPart({ value: 'hello' })).to.be.false;
        });

        it('should return false for undefined', () => {
            expect(instance.isDataPart(undefined)).to.be.false;
        });
    });

    describe('isPromptTsxPart', () => {
        it('should return true for a prompt-tsx part with non-string value', () => {
            expect(instance.isPromptTsxPart({ value: { component: 'div' } })).to.be.true;
        });

        it('should return false for a text part with string value', () => {
            expect(instance.isPromptTsxPart({ value: 'hello' })).to.be.false;
        });

        it('should return false for a data part', () => {
            expect(instance.isPromptTsxPart({ data: new Uint8Array(), mimeType: 'text/plain' })).to.be.false;
        });
    });

    describe('uint8ArrayToBase64', () => {
        it('should encode an empty array', () => {
            const result = uint8ArrayToBase64(new Uint8Array([]));
            expect(result).to.equal('');
        });

        it('should encode a simple string as Uint8Array', () => {
            const data = new Uint8Array(Buffer.from('hello'));
            const result = uint8ArrayToBase64(data);
            expect(result).to.equal(Buffer.from('hello').toString('base64'));
        });

        it('should encode binary data', () => {
            const data = new Uint8Array([0, 1, 2, 255]);
            const result = uint8ArrayToBase64(data);
            expect(result).to.equal(Buffer.from([0, 1, 2, 255]).toString('base64'));
        });
    });

    describe('convertPartToDto', () => {
        it('should convert a LanguageModelTextPart to text DTO', () => {
            const part = { value: 'some text' };
            const result = instance.convertPartToDto(part);
            expect(result).to.deep.equal({ type: 'text', value: 'some text' });
        });

        it('should convert a LanguageModelDataPart to data DTO', () => {
            const data = new Uint8Array(Buffer.from('binary content'));
            const part = { data, mimeType: 'application/octet-stream' };
            const result = instance.convertPartToDto(part);
            expect(result.type).to.equal('data');
            expect((result as { base64: string }).base64).to.equal(Buffer.from('binary content').toString('base64'));
            expect((result as { mimeType: string }).mimeType).to.equal('application/octet-stream');
        });

        it('should convert a LanguageModelPromptTsxPart to prompt-tsx DTO', () => {
            const part = { value: { component: 'SomeComponent', props: { x: 1 } } };
            const result = instance.convertPartToDto(part);
            expect(result).to.deep.equal({ type: 'prompt-tsx', value: { component: 'SomeComponent', props: { x: 1 } } });
        });

        it('should convert an unknown part to unknown DTO', () => {
            const part = { someUnknownField: 42 };
            const result = instance.convertPartToDto(part);
            expect(result).to.deep.equal({ type: 'unknown', json: '{"someUnknownField":42}' });
        });

        it('should convert a LanguageModelDataPart with image mime type to data DTO', () => {
            const imageData = new Uint8Array([137, 80, 78, 71]); // PNG header bytes
            const part = { data: imageData, mimeType: 'image/png' };
            const result = instance.convertPartToDto(part);
            expect(result.type).to.equal('data');
            expect((result as { base64: string }).base64).to.equal(Buffer.from(imageData).toString('base64'));
            expect((result as { mimeType: string }).mimeType).to.equal('image/png');
        });

        it('should convert a LanguageModelDataPart with text/x-json to data DTO', () => {
            const jsonStr = '{"key":"value"}';
            const data = new Uint8Array(Buffer.from(jsonStr));
            const part = { data, mimeType: 'text/x-json' };
            const result = instance.convertPartToDto(part);
            expect(result.type).to.equal('data');
            expect((result as { base64: string }).base64).to.equal(Buffer.from(jsonStr).toString('base64'));
        });
    });
});
