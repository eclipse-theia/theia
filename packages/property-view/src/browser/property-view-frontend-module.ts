/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
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

import { bindViewContribution, WidgetFactory } from '@theia/core/lib/browser';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ContainerModule } from '@theia/core/shared/inversify';
import { EmptyPropertyViewWidgetProvider } from './empty-property-view-widget-provider';
import { PropertyDataService } from './property-data-service';
import { PropertyViewContribution } from './property-view-contribution';
import { PropertyViewService } from './property-view-service';
import { PropertyViewWidget } from './property-view-widget';
import { PropertyViewWidgetProvider } from './property-view-widget-provider';
import { bindResourcePropertyView } from './resource-property-view';
import '../../src/browser/style/property-view.css';

export default new ContainerModule(bind => {
    bind(PropertyViewService).toSelf().inSingletonScope();

    bindContributionProvider(bind, PropertyDataService);
    bindContributionProvider(bind, PropertyViewWidgetProvider);

    bind(EmptyPropertyViewWidgetProvider).toSelf().inSingletonScope();
    bind(PropertyViewWidgetProvider).to(EmptyPropertyViewWidgetProvider);

    bind(PropertyViewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: PropertyViewWidget.ID,
        createWidget: () => container.get(PropertyViewWidget)
    })).inSingletonScope();

    bindViewContribution(bind, PropertyViewContribution);

    bindResourcePropertyView(bind);
});
