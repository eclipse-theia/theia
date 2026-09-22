// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { Container } from 'inversify';
import { ContributionProvider, ILogger } from '../../common';
import { CorePreferences } from '../../common/core-preferences';
import { FrontendApplicationContribution } from '../frontend-application-contribution';
import { DefaultWindowService } from './default-window-service';
import assert = require('assert');
import { MockLogger } from '../../common/test/mock-logger';

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
        container.bind(ILogger).to(MockLogger).inSingletonScope();
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
    it('should reload unconditionally when restored from the back/forward cache', () => {
        const frontendContributions: TestFrontendApplicationContribution[] = [
            new TestFrontendApplicationContribution(true),
        ];
        const windowService = setupWindowService('always', frontendContributions);
        let reloaded = 0;
        windowService.reload = () => { reloaded++; };
        windowService['handlePageShow']({ persisted: false } as PageTransitionEvent);
        const reloadsBeforeRestore = reloaded;
        windowService['handlePageShow']({ persisted: true } as PageTransitionEvent);
        assert(reloadsBeforeRestore === 0, 'a regular page show should not reload');
        assert(reloaded === 1, 'a restored page should reload');
        assert(windowService['collectContributionUnloadVetoes']().length === 0, 'the recovery reload should not be vetoed');
    });
    it('onUnload should fire at most once, even if `pagehide` fires repeatedly', () => {
        const windowService = setupWindowService('never', []);
        let fired = 0;
        windowService.onUnload(() => fired++);
        windowService['handlePageHide']();
        windowService['handlePageHide']();
        assert(fired === 1, `onUnload should have fired once, but fired ${fired} time(s)`);
    });
});
