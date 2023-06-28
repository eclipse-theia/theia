// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MaybePromise } from '../../common/types';
import { inject, injectable, interfaces, named } from 'inversify';
import { ContributionProvider } from '../../common/contribution-provider';

export const PreloadContribution = Symbol('PreloadContribution') as symbol & interfaces.Abstract<PreloadContribution>;

export interface PreloadContribution {
    initialize(): MaybePromise<void>;
}

@injectable()
export class Preloader {

    @inject(ContributionProvider) @named(PreloadContribution)
    protected readonly contributions: ContributionProvider<PreloadContribution>;

    async initialize(): Promise<void> {
        await Promise.allSettled(this.contributions.getContributions().map(contrib => contrib.initialize()));
    }

}
