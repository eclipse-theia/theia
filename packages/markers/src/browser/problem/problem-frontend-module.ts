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

import { ContainerModule } from 'inversify';
import { ProblemWidget } from './problem-widget';
import { ProblemContribution } from './problem-contribution';
import { createProblemWidget } from './problem-container';
import { FrontendApplicationContribution, bindViewContribution } from '@theia/core/lib/browser';
import { ProblemManager } from './problem-manager';
import { PROBLEM_KIND } from '../../common/problem-marker';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { NavigatorTreeDecorator } from '@theia/navigator/lib/browser/navigator-decorator-service';
import { ProblemDecorator } from './problem-decorator';

import '../../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(ProblemManager).toSelf().inSingletonScope();

    bind(ProblemWidget).toDynamicValue(ctx =>
        createProblemWidget(ctx.container)
    );
    bind(WidgetFactory).toDynamicValue(context => ({
        id: PROBLEM_KIND,
        createWidget: () => context.container.get<ProblemWidget>(ProblemWidget)
    }));

    bindViewContribution(bind, ProblemContribution);
    bind(FrontendApplicationContribution).toService(ProblemContribution);

    bind(ProblemDecorator).toSelf().inSingletonScope();
    bind(NavigatorTreeDecorator).toService(ProblemDecorator);
});
