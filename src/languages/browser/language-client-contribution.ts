/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { ILanguageClient, LanguageClientOptions, LanguageIdentifier } from '../common';
import { ContributionProvider } from '../../application/common/contribution-provider';

export const LanguageClientContribution = Symbol('LanguageClientContribution');
export interface LanguageClientContribution {
    createOptions?(identifier: LanguageIdentifier, initial: Promise<LanguageClientOptions>): Promise<LanguageClientOptions>;
    onWillStart?(language: LanguageIdentifier, languageClient: ILanguageClient): void;
}

@injectable()
export class CompositeLanguageClientContribution implements LanguageClientContribution {

    constructor(
        @inject(ContributionProvider) @named(LanguageClientContribution)
        protected readonly contributions: ContributionProvider<LanguageClientContribution>
    ) { }

    createOptions(identifier: LanguageIdentifier, initial: Promise<LanguageClientOptions>): Promise<LanguageClientOptions> {
        if (!this.contributions) {
            return initial;
        }
        return this.contributions.getContributions().reduce((options, contribution) =>
            contribution.createOptions ? contribution.createOptions(identifier, options) : options
            , initial
        );
    }

    onWillStart(language: LanguageIdentifier, languageClient: ILanguageClient): void {
        if (this.contributions) {
            this.contributions.getContributions().forEach(contribution => {
                if (contribution.onWillStart) {
                    contribution.onWillStart(language, languageClient);
                }
            });
        }
    }

}
