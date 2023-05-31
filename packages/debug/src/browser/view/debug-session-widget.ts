// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, postConstruct, interfaces, Container } from '@theia/core/shared/inversify';
import {
    Message, ApplicationShell, Widget, BaseWidget, PanelLayout, StatefulWidget, ViewContainer, codicon, ViewContainerTitleOptions, WidgetManager
} from '@theia/core/lib/browser';
import { DebugThreadsWidget } from './debug-threads-widget';
import { DebugStackFramesWidget } from './debug-stack-frames-widget';
import { DebugBreakpointsWidget } from './debug-breakpoints-widget';
import { DebugVariablesWidget } from './debug-variables-widget';
import { DebugToolBar } from './debug-toolbar-widget';
import { DebugViewModel } from './debug-view-model';
import { DebugWatchWidget } from './debug-watch-widget';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';

export const DEBUG_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'debug',
    iconClass: codicon('debug-alt'),
    closeable: true
};

@injectable()
export class DebugSessionWidget extends BaseWidget implements StatefulWidget, ApplicationShell.TrackableWidgetProvider {

    static createContainer(parent: interfaces.Container): Container {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = parent;
        child.bind(DebugViewModel).toSelf();
        child.bind(DebugToolBar).toSelf();
        child.bind(DebugSessionWidget).toSelf();
        return child;
    }

    static createWidget(parent: interfaces.Container): DebugSessionWidget {
        return DebugSessionWidget.createContainer(parent).get(DebugSessionWidget);
    }

    static subwidgets = [DebugThreadsWidget, DebugStackFramesWidget, DebugVariablesWidget, DebugWatchWidget, DebugBreakpointsWidget];

    protected viewContainer: ViewContainer;

    @inject(ViewContainer.Factory)
    protected readonly viewContainerFactory: ViewContainer.Factory;

    @inject(DebugViewModel)
    readonly model: DebugViewModel;

    @inject(DebugToolBar)
    protected readonly toolbar: DebugToolBar;

    @inject(WidgetManager) protected readonly widgetManager: WidgetManager;
    @inject(FrontendApplicationStateService) protected readonly stateService: FrontendApplicationStateService;

    @postConstruct()
    protected init(): void {
        this.id = 'debug:session:' + this.model.id;
        this.title.label = this.model.label;
        this.title.caption = this.model.label;
        this.title.closable = true;
        this.title.iconClass = codicon('debug-alt');
        this.addClass('theia-session-container');

        this.viewContainer = this.viewContainerFactory({
            id: 'debug:view-container:' + this.model.id
        });
        this.viewContainer.setTitleOptions(DEBUG_VIEW_CONTAINER_TITLE_OPTIONS);
        this.stateService.reachedState('initialized_layout').then(() => {
            for (const subwidget of DebugSessionWidget.subwidgets) {
                const widgetPromises = [];
                const existingWidget = this.widgetManager.tryGetPendingWidget(subwidget.FACTORY_ID);
                // No other view container instantiated this widget during startup.
                if (!existingWidget) {
                    widgetPromises.push(this.widgetManager.getOrCreateWidget(subwidget.FACTORY_ID));
                }
                Promise.all(widgetPromises).then(widgets => widgets.forEach(widget => this.viewContainer.addWidget(widget)));
            }
        });

        this.toDispose.pushAll([
            this.toolbar,
            this.viewContainer
        ]);

        const layout = this.layout = new PanelLayout();
        layout.addWidget(this.toolbar);
        layout.addWidget(this.viewContainer);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.toolbar.focus();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.getTrackableWidgets().forEach(w => w.update());
    }

    getTrackableWidgets(): Widget[] {
        return [this.viewContainer];
    }

    storeState(): object {
        return this.viewContainer.storeState();
    }

    restoreState(oldState: ViewContainer.State): void {
        this.viewContainer.restoreState(oldState);
    }
}
