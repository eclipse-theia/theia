/********************************************************************************
 * Copyright (C) 2020 TORO Limited and others.
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

import { AbstractViewContribution, bindViewContribution, WidgetFactory } from '@theia/core/lib/browser';
import { SampleViewUnclosableView } from './sample-unclosable-view';
import { injectable, interfaces } from 'inversify';

@injectable()
export class SampleUnclosableViewContribution extends AbstractViewContribution<SampleViewUnclosableView> {

    static readonly SAMPLE_UNCLOSABLE_VIEW_TOGGLE_COMMAND_ID = 'sampleUnclosableView:toggle';

    constructor() {
        super({
            widgetId: SampleViewUnclosableView.ID,
            widgetName: 'Sample Unclosable View',
            toggleCommandId: SampleUnclosableViewContribution.SAMPLE_UNCLOSABLE_VIEW_TOGGLE_COMMAND_ID,
            defaultWidgetOptions: {
                area: 'main'
            }
        });
    }
}

export const bindSampleUnclosableView = (bind: interfaces.Bind) => {
    bindViewContribution(bind, SampleUnclosableViewContribution);
    bind(SampleViewUnclosableView).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: SampleViewUnclosableView.ID,
        createWidget: () => ctx.container.get<SampleViewUnclosableView>(SampleViewUnclosableView)
    }));
};
