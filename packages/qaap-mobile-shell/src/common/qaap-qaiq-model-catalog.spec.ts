import { expect } from 'chai';
import {
    OLLAMA_DEFAULT_HOST,
    QAAP_QAIQ_BYOK_PROVIDERS,
    vendorHasByokCredential,
} from './qaap-qaiq-byok-provider-registry';
import {
    groupQaiqModelsByProvider,
    isQaiqByokLanguageModelId,
    listQaiqModelsFromPreferences,
    listQaiqModelsFromRegisteredLanguageModels,
    mergeQaiqModelOptions,
} from './qaap-qaiq-model-catalog';

describe('QAAP_QAIQ_BYOK_PROVIDERS', () => {
    it('defines credential and model prefs for every provider', () => {
        for (const provider of QAAP_QAIQ_BYOK_PROVIDERS) {
            expect(provider.vendor.trim(), provider.vendor).to.not.equal('');
            expect(provider.credentialPref.trim(), provider.vendor).to.not.equal('');
            expect(provider.modelListPrefs.length, provider.vendor).to.be.greaterThan(0);
            expect(provider.label.trim(), provider.vendor).to.not.equal('');
        }
    });
});

describe('listQaiqModelsFromPreferences', () => {
    it('returns models for every configured BYOK provider', () => {
        for (const provider of QAAP_QAIQ_BYOK_PROVIDERS) {
            const models = listQaiqModelsFromPreferences(key => {
                if (key === provider.credentialPref) {
                    return 'configured';
                }
                if (provider.modelListPrefs.includes(key)) {
                    return ['test-model'];
                }
                return undefined;
            });
            expect(models.some(model => model.vendor === provider.vendor), provider.vendor).to.be.true;
        }
    });

    it('returns OpenRouter models when API key is configured', () => {
        const models = listQaiqModelsFromPreferences(key => {
            if (key === 'ai-features.openrouter.openrouterApiKey') {
                return 'sk-test';
            }
            if (key === 'ai-features.openrouter.openrouterModels') {
                return [];
            }
            return undefined;
        });
        expect(models.some(m => m.vendor === 'openrouter')).to.be.true;
    });

    it('drops excluded OpenRouter slugs from the QAIQ model picker', () => {
        const models = listQaiqModelsFromPreferences(key => {
            if (key === 'ai-features.openrouter.openrouterApiKey') {
                return 'sk-test';
            }
            if (key === 'ai-features.openrouter.openrouterModels') {
                return [
                    'deepseek/deepseek-v4-flash:free',
                    'nvidia/nemotron-3-super-120b-a12b:free',
                ];
            }
            return undefined;
        });
        expect(models.some(m => m.modelId === 'deepseek/deepseek-v4-flash:free')).to.be.false;
        expect(models.some(m => m.modelId === 'nvidia/nemotron-3-super-120b-a12b:free')).to.be.true;
    });

    it('returns Hugging Face models when API key is configured', () => {
        const models = listQaiqModelsFromPreferences(key => {
            if (key === 'ai-features.huggingFace.apiKey') {
                return 'hf_test';
            }
            if (key === 'ai-features.huggingFace.models') {
                return [];
            }
            return undefined;
        });
        expect(models.some(m => m.vendor === 'huggingface')).to.be.true;
    });

    it('returns explicitly configured models even without an API key', () => {
        const models = listQaiqModelsFromPreferences(key => {
            if (key === 'ai-features.openrouter.openrouterModels') {
                return ['nvidia/nemotron-3-super-120b-a12b:free'];
            }
            return undefined;
        });
        expect(models.some(m => m.vendor === 'openrouter' && m.modelId === 'nvidia/nemotron-3-super-120b-a12b:free')).to.be.true;
    });

    it('does not treat the default Ollama host as configured', () => {
        const models = listQaiqModelsFromPreferences(key => {
            if (key === 'ai-features.ollama.ollamaHost') {
                return OLLAMA_DEFAULT_HOST;
            }
            return undefined;
        });
        expect(models.some(m => m.vendor === 'ollama')).to.be.false;
    });

    it('includes providers configured only via runtime env vars', () => {
        const models = listQaiqModelsFromPreferences(
            () => undefined,
            key => (key === 'OPENROUTER_API_KEY' ? 'sk-env' : undefined),
        );
        expect(models.some(m => m.vendor === 'openrouter')).to.be.true;
    });

    it('merges workspace and browser model lists', () => {
        const merged = mergeQaiqModelOptions(
            [{ vendor: 'openrouter', provider: 'openai', modelId: 'a', label: 'a' }],
            [{ vendor: 'nvidia', provider: 'openai', modelId: 'b', label: 'b' }],
            [{ vendor: 'openrouter', provider: 'openai', modelId: 'a', label: 'a' }],
        );
        expect(merged).to.have.length(2);
    });

    it('skips providers without credentials', () => {
        expect(vendorHasByokCredential(() => undefined, 'huggingface')).to.be.false;
        expect(vendorHasByokCredential(key => {
            if (key === 'ai-features.huggingFace.apiKey') {
                return 'hf_key';
            }
            return undefined;
        }, 'huggingface')).to.be.true;
        expect(vendorHasByokCredential(key => {
            if (key === 'ai-features.google.apiKey') {
                return 'google_key';
            }
            return undefined;
        }, 'gemini')).to.be.true;
    });

    it('maps registered language models from AI Configuration', () => {
        const models = listQaiqModelsFromRegisteredLanguageModels([
            { id: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron free' },
            { id: 'anthropic/claude-opus-4-7', name: 'Claude Opus 4.7' },
            { id: 'copilot/gpt-4o', name: 'Copilot' },
        ]);
        expect(models).to.have.length(2);
        expect(models.some(m => m.vendor === 'openrouter')).to.be.true;
        expect(models.some(m => m.vendor === 'anthropic')).to.be.true;
        expect(isQaiqByokLanguageModelId('copilot/gpt-4o')).to.be.false;
    });

    it('groups models by vendor', () => {
        const grouped = groupQaiqModelsByProvider([
            { vendor: 'openrouter', provider: 'openai', modelId: 'a', label: 'a' },
            { vendor: 'nvidia', provider: 'openai', modelId: 'b', label: 'b' },
        ]);
        expect(grouped.get('openrouter')).to.have.length(1);
        expect(grouped.get('nvidia')).to.have.length(1);
    });
});
