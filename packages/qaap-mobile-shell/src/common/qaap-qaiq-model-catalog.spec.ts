import { expect } from 'chai';
import {
    QAAP_QAIQ_BYOK_PROVIDERS,
    vendorHasByokCredential,
} from './qaap-qaiq-byok-provider-registry';
import { groupQaiqModelsByProvider, listQaiqModelsFromPreferences } from './qaap-qaiq-model-catalog';

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

    it('groups models by vendor', () => {
        const grouped = groupQaiqModelsByProvider([
            { vendor: 'openrouter', provider: 'openai', modelId: 'a', label: 'a' },
            { vendor: 'nvidia', provider: 'openai', modelId: 'b', label: 'b' },
        ]);
        expect(grouped.get('openrouter')).to.have.length(1);
        expect(grouped.get('nvidia')).to.have.length(1);
    });
});
