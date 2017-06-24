/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { ContributionProvider } from '../../application/common';
import { FrontendApplication, FrontendApplicationContribution } from '../../application/browser';
import { LanguageClientContribution } from './language-client-contribution';

@injectable()
export class LanguagesFrontendContribution implements FrontendApplicationContribution {

    constructor(
        @inject(ContributionProvider) @named(LanguageClientContribution)
        protected readonly contributions: ContributionProvider<LanguageClientContribution>
    ) { }

    onStart(app: FrontendApplication): void {
        for (const contribution of this.contributions.getContributions()) {
            contribution.waitForActivation(app).then(() =>
                contribution.activate(app)
            )
        }
    }

}
