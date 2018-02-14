/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { ProblemWidget } from './problem-widget';
import { ProblemContribution } from './problem-contribution';
import { createProblemWidget } from './problem-container';
import { CommandContribution, MenuContribution } from "@theia/core/lib/common";
import { FrontendApplicationContribution, KeybindingContribution } from '@theia/core/lib/browser';
import { ProblemManager } from './problem-manager';
import { PROBLEM_KIND } from '../../common/problem-marker';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { TreeDecorator } from "@theia/core/lib/browser";
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

    bind(ProblemContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution, FrontendApplicationContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(ProblemContribution)
        ).inSingletonScope();
    }
    bind(ProblemDecorator).toSelf().inSingletonScope();
    bind(TreeDecorator).toDynamicValue(ctx => ctx.container.get(ProblemDecorator)).inSingletonScope();
});
