/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import { LanguageClientProvider } from '@theia/languages/lib/browser/language-client-provider';
import { ILanguageClient, LanguageClientContribution } from '@theia/languages/lib/browser';
import { LanguageClientContributionProvider } from './language-client-contribution-provider';

@injectable()
export class LanguageClientProviderImpl implements LanguageClientProvider {

    @inject(LanguageClientContributionProvider)
    protected readonly languageClientContribution: LanguageClientContributionProvider;

    async getLanguageClient(languageId: string): Promise<ILanguageClient | undefined> {
        const contribution = this.getLanguageContribution(languageId);
        if (contribution) {
            return contribution.languageClient;
        }
    }

    protected getLanguageContribution(languageId: string): LanguageClientContribution | undefined {
        const contributions = this.languageClientContribution.getLanguageClientContributions();
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
