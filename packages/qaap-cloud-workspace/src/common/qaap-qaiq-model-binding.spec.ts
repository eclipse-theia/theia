import { expect } from 'chai';
import { parseTheiaLanguageModelId, resolveQaapQaiqModelBinding } from './qaap-qaiq-model-binding';

describe('qaap-qaiq-model-binding', () => {
    it('parses openrouter and nvidia model ids', () => {
        expect(parseTheiaLanguageModelId('openrouter/nvidia/nemotron-3-super-120b-a12b:free')?.modelId)
            .to.equal('nvidia/nemotron-3-super-120b-a12b:free');
        expect(parseTheiaLanguageModelId('nvidia/meta/llama-3.3-70b-instruct')?.vendor).to.equal('nvidia');
        expect(parseTheiaLanguageModelId('google/gemini-2.5-flash')?.provider).to.equal('gemini');
    });

    it('resolves from languageModelAliases default/code', () => {
        const binding = resolveQaapQaiqModelBinding(key => {
            if (key === 'ai-features.languageModelAliases') {
                return { 'default/code': { selectedModel: 'openrouter/deepseek/deepseek-chat:free' } };
            }
            return undefined;
        });
        expect(binding?.vendor).to.equal('openrouter');
        expect(binding?.modelId).to.equal('deepseek/deepseek-chat:free');
    });

    it('resolves nvidia from model list when aliases are empty', () => {
        const binding = resolveQaapQaiqModelBinding(key => {
            if (key === 'ai-features.nvidia.nvidiaModels') {
                return ['meta/llama-3.3-70b-instruct'];
            }
            return undefined;
        });
        expect(binding?.vendor).to.equal('nvidia');
        expect(binding?.provider).to.equal('openai');
    });

    it('parses ollama, anthropic, mistral and huggingface ids', () => {
        expect(parseTheiaLanguageModelId('ollama/qwen2.5-coder:7b')?.provider).to.equal('ollama');
        expect(parseTheiaLanguageModelId('anthropic/claude-sonnet-4-20250514')?.provider).to.equal('anthropic');
        expect(parseTheiaLanguageModelId('mistral/ministral-8b-latest')?.provider).to.equal('mistral');
        expect(parseTheiaLanguageModelId('huggingface/meta-llama/Llama-3.1-8B-Instruct')?.vendor).to.equal('huggingface');
    });
});
