/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { ContainerModule, injectable, inject, named } from 'inversify';
import { BaseWidget, Message } from './widgets';
import { AbstractViewContribution, bindViewContribution } from './shell';
import { WidgetFactory } from './widget-manager';
import { FrontendApplicationContribution } from './frontend-application';
import { FrontendApplicationStateService } from './frontend-application-state';
import { ContributionProvider, MaybePromise, bindContributionProvider } from '../common';

export default new ContainerModule(bind => {
    bind(MochaWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => (<WidgetFactory>{
        id: MochaWidget.ID,
        createWidget: () => ctx.container.get(MochaWidget)
    })).inSingletonScope();
    bindViewContribution(bind, MochaFrontendContribution);
    bind(FrontendApplicationContribution).toService(MochaFrontendContribution);

    bindContributionProvider(bind, FrontendTestSuite);
});

@injectable()
export class MochaWidget extends BaseWidget {

    static ID = 'mocha';

    constructor() {
        super({
            node: MochaWidget.getNode()
        });
        this.id = MochaWidget.ID;
        this.title.label = 'Mocha';
        this.title.caption = 'Mocha';
        this.title.closable = true;
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

}
export namespace MochaWidget {
    export function getNode(): HTMLElement {
        const element = document.getElementById('mocha') || document.createElement('div');
        element.tabIndex = 0;
        element.id = 'mocha';
        element.style.display = 'block';
        return element;
    }
}

export const FrontendTestSuite = Symbol('FrontendTestSuite');
export interface FrontendTestSuite {
    load(): MaybePromise<void>;
}

@injectable()
export class MochaFrontendContribution extends AbstractViewContribution<MochaWidget> implements FrontendApplicationContribution {

    @inject(FrontendApplicationStateService)
    protected readonly shellState: FrontendApplicationStateService;

    @inject(ContributionProvider) @named(FrontendTestSuite)
    protected readonly frontendTests: ContributionProvider<FrontendTestSuite>;

    constructor() {
        super({
            widgetId: MochaWidget.ID,
            widgetName: 'Mocha',
            defaultWidgetOptions: {
                area: 'main'
            },
            toggleCommandId: 'toggle:mocha'
        });
    }

    async onStart(): Promise<void> {
        for (const testSuite of this.frontendTests.getContributions()) {
            await testSuite.load();
        }
    }

}
