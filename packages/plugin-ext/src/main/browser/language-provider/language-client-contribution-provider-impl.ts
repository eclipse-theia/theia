/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct, named } from 'inversify';
import { ContributionProvider } from '@theia/core/lib/common';
import { Disposable } from '@theia/core/lib/common/disposable';
import { FrontendApplication } from '@theia/core/lib/browser';
import { LanguageClientContributionProvider } from './language-client-contribution-provider';
import { ILogger } from '@theia/core/lib/common/logger';
import { LanguageClientContribution } from '@theia/languages/lib/browser';

@injectable()
export class LanguageClientContributionProviderImpl implements LanguageClientContributionProvider {
    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;
    @inject(ILogger)
    protected readonly logger: ILogger;
    @inject(ContributionProvider) @named(LanguageClientContribution)
    protected readonly contributions: ContributionProvider<LanguageClientContribution>;

    protected readonly languageClientContributors = new Map<string, LanguageClientContribution>();

    @postConstruct()
    collectContributions(): void {
        for (const contribution of this.contributions.getContributions()) {
            this.languageClientContributors.set(contribution.id, contribution);
        }
    }

    getLanguageClientContributions(): IterableIterator<LanguageClientContribution> {
        return this.languageClientContributors.values();
    }

    registerLanguageClientContribution(clientContribution: LanguageClientContribution): Disposable {
        const id = clientContribution.id;
        if (this.languageClientContributors.has(id)) {
            this.logger.warn(`The language contribution with type '${id}' was already registered.`);
            return Disposable.NULL;
        }
        this.languageClientContributors.set(clientContribution.id, clientContribution);

        clientContribution.waitForActivation(this.app).then(() =>
            clientContribution.activate(this.app)
        );

        this.logger.info(`The language contribution with type '${id}' was activated.`);

        return Disposable.create(() => this.unregisterLanguageClientContribution(id));
    }

    unregisterLanguageClientContribution(id: string): void {
        const contribution = this.languageClientContributors.get(id);
        if (!contribution) {
            return;
        }
        contribution.deactivate();
        this.languageClientContributors.delete(id);
        this.logger.info(`The language contribution with type '${id}' was deactivated.`);
    }

}
