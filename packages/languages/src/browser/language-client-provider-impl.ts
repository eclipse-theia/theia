/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { ContributionProvider } from '@theia/core/lib/common';
import { LanguageClientContribution } from './language-client-contribution';
import { ILanguageClient } from '../common/languageclient-services';
import { LanguageClientProvider } from './language-client-provider';

@injectable()
export class LanguageClientProviderImpl implements LanguageClientProvider {

    @inject(ContributionProvider) @named(LanguageClientContribution)
    private readonly contributions: ContributionProvider<LanguageClientContribution>;

    async getLanguageClient(languageId: string): Promise<ILanguageClient | undefined> {
        const contribution = this.getLanguageContribution(languageId);
        if (contribution) {
            return contribution.languageClient;
        }
    }

    protected getLanguageContribution(languageId: string): LanguageClientContribution | undefined {
        const contributions = this.contributions.getContributions();
        if (contributions) {
            for (const contribution of contributions) {
                if (contribution.id === languageId) {
                    return contribution;
                }
            }
        }
        return undefined;
    }
}
