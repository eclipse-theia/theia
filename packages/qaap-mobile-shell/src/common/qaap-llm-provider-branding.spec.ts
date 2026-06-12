import { expect } from 'chai';
import {
    resolveLlmProviderBrand,
    resolveLlmProviderBrandKey,
} from './qaap-llm-provider-branding';

describe('qaap-llm-provider-branding', () => {

    it('maps BYOK vendors to brand keys', () => {
        expect(resolveLlmProviderBrandKey('openai', 'gpt-5.5')).to.equal('openai');
        expect(resolveLlmProviderBrandKey('nvidia', 'meta/llama-3.3-70b-instruct')).to.equal('nvidia');
        expect(resolveLlmProviderBrandKey('gemini', 'gemini-2.5-flash')).to.equal('gemini');
    });

    it('infers upstream provider from OpenRouter slugs', () => {
        expect(resolveLlmProviderBrandKey('openrouter', 'deepseek/deepseek-v3')).to.equal('deepseek');
        expect(resolveLlmProviderBrandKey('openrouter', 'qwen/qwen-2.5-coder')).to.equal('qwen');
        expect(resolveLlmProviderBrandKey('openrouter', 'google/gemma-3-27b-it')).to.equal('google');
        expect(resolveLlmProviderBrandKey('openrouter', 'anthropic/claude-sonnet-4-6')).to.equal('anthropic');
    });

    it('returns svg brands for known providers', () => {
        expect(resolveLlmProviderBrand('anthropic')?.imageUrl).to.match(/^data:image\/png;base64,/);
        expect(resolveLlmProviderBrand('openai')?.tone).to.equal('dark');
        expect(resolveLlmProviderBrand('openai')?.imageUrl).to.match(/^data:image\/png;base64,/);
        expect(resolveLlmProviderBrand('huggingface')?.imageUrl).to.match(/^data:image\/png;base64,/);
        expect(resolveLlmProviderBrand('ollama')?.imageUrl).to.match(/^data:image\/png;base64,/);
        expect(resolveLlmProviderBrand('openrouter', 'moonshotai/kimi-k2.6:free')?.imageUrl).to.match(/^data:image\/png;base64,/);
        expect(resolveLlmProviderBrand('openrouter', 'nvidia/nemotron-3-super-120b-a12b:free')?.id).to.equal('nvidia');
        expect(resolveLlmProviderBrand('qwen')?.svg).to.include('<svg');
    });
});
