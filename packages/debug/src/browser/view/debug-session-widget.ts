/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, postConstruct, interfaces, Container } from 'inversify';
import { Message, ApplicationShell, Widget, SplitPanel, BaseWidget, PanelLayout } from '@theia/core/lib/browser';
import { DebugThreadsWidget } from './debug-threads-widget';
import { DebugStackFramesWidget } from './debug-stack-frames-widget';
import { DebugBreakpointsWidget } from './debug-breakpoints-widget';
import { DebugVariablesWidget } from './debug-variables-widget';
import { DebugToolBar } from './debug-toolbar-widget';
import { DebugViewModel, DebugViewOptions } from './debug-view-model';
import { BOTTOM_AREA_ID, MAIN_AREA_ID } from '@theia/core/lib/browser/shell/theia-dock-panel';
import { ViewContainer } from '@theia/core/lib/browser/view-container';

export const DebugSessionWidgetFactory = Symbol('DebugSessionWidgetFactory');
export type DebugSessionWidgetFactory = (options: DebugViewOptions) => DebugSessionWidget;

@injectable()
export class DebugSessionWidget extends BaseWidget implements ApplicationShell.TrackableWidgetProvider {

    static createContainer(parent: interfaces.Container, options: DebugViewOptions): Container {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = parent;
        child.bind(DebugViewOptions).toConstantValue(options);
        child.bind(DebugViewModel).toSelf();
        child.bind(DebugToolBar).toSelf();
        child.bind(DebugThreadsWidget).toDynamicValue(({ container }) => DebugThreadsWidget.createWidget(container));
        child.bind(DebugStackFramesWidget).toDynamicValue(({ container }) => DebugStackFramesWidget.createWidget(container));
        child.bind(DebugVariablesWidget).toDynamicValue(({ container }) => DebugVariablesWidget.createWidget(container));
        child.bind(DebugBreakpointsWidget).toDynamicValue(({ container }) => DebugBreakpointsWidget.createWidget(container));
        child.bind(DebugSessionWidget).toSelf();
        return child;
    }
    static createWidget(parent: interfaces.Container, options: DebugViewOptions): DebugSessionWidget {
        return DebugSessionWidget.createContainer(parent, options).get(DebugSessionWidget);
    }

    protected readonly container = new SplitPanel();
    protected viewContainer: ViewContainer;

    @inject(ViewContainer.Factory)
    protected readonly viewContainerFactory: ViewContainer.Factory;

    @inject(DebugViewModel)
    readonly model: DebugViewModel;

    @inject(DebugToolBar)
    protected readonly toolbar: DebugToolBar;

    @postConstruct()
    protected init(): void {
        this.id = 'debug:session:' + this.model.id;
        this.title.label = this.model.label;
        this.title.closable = true;
        this.title.iconClass = 'fa debug-tab-icon';
        this.addClass('theia-session-container');

        this.container.addClass('theia-debug-widget-container');
        this.viewContainer = this.viewContainerFactory(...[
            {
                widget: DebugThreadsWidget,
                options: {
                    weight: 30
                }
            },
            {
                widget: DebugStackFramesWidget,
                options: {
                    weight: 20
                }
            },
            {
                widget: DebugVariablesWidget,
                options: {
                    weight: 10
                }
            },
            {
                widget: DebugBreakpointsWidget,
                options: {
                    weight: 10
                }
            }]);

        this.container.addWidget(this.viewContainer);

        this.toDispose.pushAll([
            this.toolbar,
            this.container,
            this.viewContainer
        ]);

        const layout = this.layout = new PanelLayout();
        layout.addWidget(this.toolbar);
        layout.addWidget(this.container);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.toolbar.focus();
    }

    protected createViewContainer(widget: Widget): Widget {
        const viewContainer = this.viewContainerFactory({ widget });
        viewContainer.addWidget(widget);
        return viewContainer;
    }

    async getTrackableWidgets(): Promise<Widget[]> {
        return this.viewContainer.getTrackableWidgets();
    }

    onAfterAttach(msg: Message): void {
        const parentId = this.node.parentElement!.parentElement!.getAttribute('id');
        this.container.orientation =
            parentId === BOTTOM_AREA_ID || parentId === MAIN_AREA_ID
                ? 'horizontal'
                : 'vertical';
        super.onAfterAttach(msg);
    }
}
