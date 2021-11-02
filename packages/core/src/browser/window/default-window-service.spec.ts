/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { Container } from 'inversify';
import { ContributionProvider } from '../../common';
import { CorePreferences } from '../core-preferences';
import { FrontendApplicationContribution } from '../frontend-application';
import { DefaultWindowService } from './default-window-service';
import assert = require('assert');

describe('DefaultWindowService', () => {
    class TestFrontendApplicationContribution implements FrontendApplicationContribution {
        constructor(private preventUnload: boolean) { }
        onWillStopCalled = false;
        onWillStop(): boolean {
            this.onWillStopCalled = true;
            return this.preventUnload;
        }
    }
    function setupWindowService(confirmExit: CorePreferences['application.confirmExit'], frontendContributions: FrontendApplicationContribution[]): DefaultWindowService {
        const container = new Container();
        container.bind(DefaultWindowService).toSelf().inSingletonScope();
        container.bind<Partial<ContributionProvider<FrontendApplicationContribution>>>(ContributionProvider)
            .toConstantValue({
                getContributions: () => frontendContributions,
            })
            .whenTargetNamed(FrontendApplicationContribution);
        container.bind<Partial<CorePreferences>>(CorePreferences)
            .toConstantValue({
                'application.confirmExit': confirmExit,
            });
        return container.get(DefaultWindowService);
    }
    it('onWillStop should be called on every contribution (never)', () => {
        const frontendContributions: TestFrontendApplicationContribution[] = [
            // preventUnload should be ignored here
            new TestFrontendApplicationContribution(true),
        ];
        const windowService = setupWindowService('never', frontendContributions);
        assert(frontendContributions.every(contribution => !contribution.onWillStopCalled), 'contributions should not be called yet');
        assert(windowService['collectContributionUnloadVetoes']().length === 0, 'there should be no vetoes');
        assert(frontendContributions.every(contribution => contribution.onWillStopCalled), 'contributions should have been called');
    });
    it('onWillStop should be called on every contribution (ifRequired)', () => {
        const frontendContributions: TestFrontendApplicationContribution[] = [
            new TestFrontendApplicationContribution(true),
            // canUnload should not stop at the previous contribution
            new TestFrontendApplicationContribution(false),
        ];
        const windowService = setupWindowService('ifRequired', frontendContributions);
        assert(frontendContributions.every(contribution => !contribution.onWillStopCalled), 'contributions should not be called yet');
        assert(windowService['collectContributionUnloadVetoes']().length > 0, 'There should be vetoes');
        assert(frontendContributions.every(contribution => contribution.onWillStopCalled), 'contributions should have been called');
    });
    it('onWillStop should be called on every contribution (always)', () => {
        const frontendContributions: TestFrontendApplicationContribution[] = [
            // canUnload should return false despite preventUnload not being set
            new TestFrontendApplicationContribution(false),
        ];
        const windowService = setupWindowService('always', frontendContributions);
        assert(frontendContributions.every(contribution => !contribution.onWillStopCalled), 'contributions should not be called yet');
        assert(windowService['collectContributionUnloadVetoes']().length > 0, 'there should be vetoes');
        assert(frontendContributions.every(contribution => contribution.onWillStopCalled), 'contributions should have been called');
    });
});
