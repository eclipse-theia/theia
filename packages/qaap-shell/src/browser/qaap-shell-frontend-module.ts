// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    DockPanelRenderer,
    DockPanelRendererFactory
} from '@theia/core/lib/browser/shell/application-shell';
import { SidePanelHandler } from '@theia/core/lib/browser/shell/side-panel-handler';
import { QaapApplicationShellWithToolbar } from './qaap-application-shell-with-toolbar';
import { QaapDockPanelRenderer } from './qaap-dock-panel-renderer';
import { QaapSidePanelHandler } from './qaap-side-panel-handler';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(QaapApplicationShellWithToolbar).toSelf().inSingletonScope();
    rebind(ApplicationShell).toService(QaapApplicationShellWithToolbar);

    bind(QaapSidePanelHandler).toSelf();
    rebind(SidePanelHandler).toService(QaapSidePanelHandler);

    bind(QaapDockPanelRenderer).toSelf().inSingletonScope();
    rebind(DockPanelRenderer).toService(QaapDockPanelRenderer);
    rebind(DockPanelRendererFactory).toFactory(({ container }) => (document?: Document | ShadowRoot) => {
        const renderer = container.get(QaapDockPanelRenderer);
        renderer.document = document;
        return renderer;
    });
});
