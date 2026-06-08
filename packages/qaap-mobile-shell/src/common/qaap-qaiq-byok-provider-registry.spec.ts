import { expect } from 'chai';
import {
    applyByokCredentialEnv,
    findQaiqByokProvider,
    formatQaiqModelProviderLabel,
    parseTheiaLanguageModelId,
} from './qaap-qaiq-byok-provider-registry';

describe('qaap-qaiq-byok-provider-registry', () => {
    it('resolves alias vendors to the canonical provider', () => {
        expect(findQaiqByokProvider('gemini')?.vendor).to.equal('google');
        expect(parseTheiaLanguageModelId('gemini/gemini-2.5-flash')?.vendor).to.equal('google');
        expect(parseTheiaLanguageModelId('gemini/gemini-2.5-flash')?.provider).to.equal('gemini');
    });

    it('formats labels from the registry', () => {
        expect(formatQaiqModelProviderLabel('huggingface')).to.equal('Hugging Face');
        expect(formatQaiqModelProviderLabel('gemini')).to.equal('Google Gemini');
    });

    it('maps credential env vars from the registry', () => {
        const env: NodeJS.ProcessEnv = {};
        applyByokCredentialEnv(env, 'huggingface', key => {
            if (key === 'ai-features.huggingFace.apiKey') {
                return 'hf_test';
            }
            return undefined;
        });
        expect(env.HUGGINGFACE_API_KEY).to.equal('hf_test');
    });
});
