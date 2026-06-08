import { expect } from 'chai';
import {
    filterOpenRouterModelSlugs,
    isExcludedOpenRouterModelSlug,
    isFreeOpenRouterModelId,
} from './openrouter-models';

describe('openrouter-models', () => {
    it('excludes deepseek-v4-flash:free from registration and free badge', () => {
        const slug = 'deepseek/deepseek-v4-flash:free';
        expect(isExcludedOpenRouterModelSlug(slug)).to.be.true;
        expect(isExcludedOpenRouterModelSlug(`openrouter/${slug}`)).to.be.true;
        expect(isFreeOpenRouterModelId(`openrouter/${slug}`)).to.be.false;
        expect(filterOpenRouterModelSlugs([
            slug,
            'nvidia/nemotron-3-super-120b-a12b:free',
        ])).to.deep.equal(['nvidia/nemotron-3-super-120b-a12b:free']);
    });
});
