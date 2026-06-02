import { expect } from 'chai';
import { groupQaiqModelsByProvider, listQaiqModelsFromPreferences } from './qaap-qaiq-model-catalog';

describe('listQaiqModelsFromPreferences', () => {
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

    it('groups models by vendor', () => {
        const grouped = groupQaiqModelsByProvider([
            { vendor: 'openrouter', provider: 'openai', modelId: 'a', label: 'a' },
            { vendor: 'nvidia', provider: 'openai', modelId: 'b', label: 'b' },
        ]);
        expect(grouped.get('openrouter')).to.have.length(1);
        expect(grouped.get('nvidia')).to.have.length(1);
    });
});
