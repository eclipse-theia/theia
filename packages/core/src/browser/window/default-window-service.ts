/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { CorePreferences } from '../core-preferences';
import { ContributionProvider } from '../../common/contribution-provider';
import { FrontendApplicationContribution, FrontendApplication } from '../frontend-application';
import { WindowService } from './window-service';

@injectable()
export class DefaultWindowService implements WindowService, FrontendApplicationContribution {

    protected frontendApplication: FrontendApplication;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    @inject(ContributionProvider)
    @named(FrontendApplicationContribution)
    protected readonly contributions: ContributionProvider<FrontendApplicationContribution>;

    onStart(app: FrontendApplication): void {
        this.frontendApplication = app;
        window.addEventListener('beforeunload', event => {
            if (!this.canUnload()) {
                event.returnValue = '';
                event.preventDefault();
                return '';
            }
        });
    }

    openNewWindow(url: string): Window | undefined {
        const newWindow = window.open(url);
        if (newWindow === null) {
            throw new Error('Cannot open a new window for URL: ' + url);
        }
        return newWindow;
    }

    canUnload(): boolean {
        const confirmExit = this.corePreferences['application.confirmExit'];
        if (confirmExit === 'never') {
            return true;
        }
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.onWillStop) {
                if (!!contribution.onWillStop(this.frontendApplication)) {
                    return false;
                }
            }
        }
        return confirmExit !== 'always';
    }

}
