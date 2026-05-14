// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/element-inspector.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { ElementInspectorService } from './element-inspector-service';
import { ElementInspectorWidget } from './element-inspector-widget';
import { ElementInspectorContribution } from './element-inspector-contribution';

export default new ContainerModule(bind => {
    bind(ElementInspectorService).toSelf().inSingletonScope();
    bind(ElementInspectorWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: ElementInspectorWidget.ID,
        createWidget: () => container.get(ElementInspectorWidget)
    })).inSingletonScope();
    bindViewContribution(bind, ElementInspectorContribution);
});
