import { expect } from 'chai';
import {
    bindingFromQaiqModelSelection,
    formatQaiqProviderFlags,
    normalizeQaiqModelBinding,
    parseTheiaLanguageModelId,
    resolveQaapQaiqModelBinding,
} from './qaap-qaiq-model-binding';

describe('parseTheiaLanguageModelId', () => {
    it('parses openrouter, nvidia, google ids', () => {
        expect(parseTheiaLanguageModelId('openrouter/nvidia/nemotron-3-super-120b-a12b:free')?.modelId)
            .to.equal('nvidia/nemotron-3-super-120b-a12b:free');
        expect(parseTheiaLanguageModelId('nvidia/meta/llama-3.3-70b-instruct')?.vendor).to.equal('nvidia');
        expect(parseTheiaLanguageModelId('google/gemini-2.5-flash')?.provider).to.equal('gemini');
        expect(parseTheiaLanguageModelId('gemini/gemini-2.5-flash')?.provider).to.equal('gemini');
    });

    it('parses ollama, anthropic, mistral and huggingface ids', () => {
        expect(parseTheiaLanguageModelId('ollama/qwen2.5-coder:7b')?.provider).to.equal('ollama');
        expect(parseTheiaLanguageModelId('anthropic/claude-sonnet-4-20250514')?.provider).to.equal('anthropic');
        expect(parseTheiaLanguageModelId('mistral/ministral-8b-latest')?.provider).to.equal('mistral');
        expect(parseTheiaLanguageModelId('huggingface/meta-llama/Llama-3.1-8B-Instruct')?.vendor).to.equal('huggingface');
    });

    it('parses openai ids with openai provider', () => {
        const b = parseTheiaLanguageModelId('openai/gpt-4o');
        expect(b?.vendor).to.equal('openai');
        expect(b?.provider).to.equal('openai');
        expect(b?.modelId).to.equal('gpt-4o');
    });

    it('falls back to openai-compatible for unknown vendors', () => {
        const b = parseTheiaLanguageModelId('custom-provider/my-model');
        expect(b?.provider).to.equal('openai');
        expect(b?.modelId).to.equal('custom-provider/my-model');
    });

    it('returns undefined for empty or null-like input', () => {
        expect(parseTheiaLanguageModelId(undefined)).to.be.undefined;
        expect(parseTheiaLanguageModelId('')).to.be.undefined;
        expect(parseTheiaLanguageModelId('  ')).to.be.undefined;
    });

    it('handles id with no slash as openai-compatible binding with unknown vendor', () => {
        const b = parseTheiaLanguageModelId('bare-model-id');
        expect(b?.vendor).to.equal('unknown');
        expect(b?.provider).to.equal('openai');
        expect(b?.modelId).to.equal('bare-model-id');
    });
});

describe('resolveQaapQaiqModelBinding', () => {
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

    it('resolves from default/universal alias when default/code is unset', () => {
        const binding = resolveQaapQaiqModelBinding(key => {
            if (key === 'ai-features.languageModelAliases') {
                return { 'default/universal': { selectedModel: 'anthropic/claude-sonnet-4-20250514' } };
            }
            return undefined;
        });
        expect(binding?.provider).to.equal('anthropic');
    });

    it('prefers default/code over other aliases', () => {
        const binding = resolveQaapQaiqModelBinding(key => {
            if (key === 'ai-features.languageModelAliases') {
                return {
                    'default/code': { selectedModel: 'anthropic/claude-sonnet-4-20250514' },
                    'default/universal': { selectedModel: 'openrouter/deepseek/deepseek-chat:free' }
                };
            }
            return undefined;
        });
        expect(binding?.provider).to.equal('anthropic');
    });

    it('falls back to default/summarize when only that alias is set', () => {
        const binding = resolveQaapQaiqModelBinding(key => {
            if (key === 'ai-features.languageModelAliases') {
                return { 'default/summarize': { selectedModel: 'nvidia/meta/llama-3.3-70b-instruct' } };
            }
            return undefined;
        });
        expect(binding?.vendor).to.equal('nvidia');
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

    it('returns undefined when no prefs are set', () => {
        expect(resolveQaapQaiqModelBinding(() => undefined)).to.be.undefined;
    });
});

describe('bindingFromQaiqModelSelection', () => {
    it('preserves provider, vendor, and modelId from the picker', () => {
        const binding = bindingFromQaiqModelSelection({
            provider: 'openai',
            vendor: 'openrouter',
            modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
        });
        expect(binding.vendor).to.equal('openrouter');
        expect(binding.modelId).to.equal('nvidia/nemotron-3-super-120b-a12b:free');
        expect(formatQaiqProviderFlags(binding)).to.equal(
            '--provider openai --model nvidia/nemotron-3-super-120b-a12b:free',
        );
    });

    it('infers huggingface vendor from Settings when only modelId was sent', () => {
        const readPref = (key: string): unknown => {
            if (key === 'ai-features.huggingFace.apiKey') {
                return 'hf_test';
            }
            if (key === 'ai-features.huggingFace.models') {
                return ['Qwen/Qwen3-Coder-Next'];
            }
            return undefined;
        };
        const binding = normalizeQaiqModelBinding(bindingFromQaiqModelSelection({
            provider: 'openai',
            vendor: 'unknown',
            modelId: 'Qwen/Qwen3-Coder-Next',
        }), readPref);
        expect(binding.vendor).to.equal('huggingface');
    });
});

describe('formatQaiqProviderFlags', () => {
    it('formats provider and model flags without quoting simple model ids', () => {
        const b = parseTheiaLanguageModelId('openrouter/deepseek/deepseek-chat:free')!;
        expect(formatQaiqProviderFlags(b)).to.equal('--provider openai --model deepseek/deepseek-chat:free');
    });

    it('shell-quotes model ids containing spaces', () => {
        const b = { vendor: 'openai' as const, provider: 'openai' as const, modelId: 'my model', contextWindow: 128000 };
        expect(formatQaiqProviderFlags(b)).to.include("'my model'");
    });
});
