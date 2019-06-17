/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { inject, injectable, named } from 'inversify';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { TreeProgress, AbstractTreeProgressService } from '@theia/core/lib/browser/tree/tree-progress';

/**
 * Symbol for all progress indicator contributors that would like to contribute into the navigator.
 */
export const NavigatorTreeProgress = Symbol('NavigatorTreeProgress');

/**
 * Progress indicator service for the navigator.
 */
@injectable()
export class NavigatorProgressService extends AbstractTreeProgressService {

    constructor(@inject(ContributionProvider) @named(NavigatorTreeProgress) protected readonly contributions: ContributionProvider<TreeProgress>) {
        super(contributions.getContributions());
    }

}
