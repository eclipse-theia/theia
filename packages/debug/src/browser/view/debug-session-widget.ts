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
import { BaseWidget, PanelLayout, Message, ApplicationShell, Widget } from '@theia/core/lib/browser';
import { ViewContainer } from '@theia/core/lib/browser/view-container';
import { DebugThreadsWidget } from './debug-threads-widget';
import { DebugStackFramesWidget } from './debug-stack-frames-widget';
import { DebugBreakpointsWidget } from './debug-breakpoints-widget';
import { DebugVariablesWidget } from './debug-variables-widget';
import { DebugToolBar } from './debug-toolbar-widget';
import { DebugViewModel, DebugViewOptions } from './debug-view-model';

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

    @inject(DebugViewModel)
    readonly model: DebugViewModel;

    @inject(DebugToolBar)
    protected readonly toolbar: DebugToolBar;

    @inject(DebugThreadsWidget)
    protected readonly threads: DebugThreadsWidget;

    @inject(DebugStackFramesWidget)
    protected readonly frames: DebugStackFramesWidget;

    @inject(DebugVariablesWidget)
    protected readonly variables: DebugVariablesWidget;

    @inject(DebugBreakpointsWidget)
    protected readonly breakpoints: DebugBreakpointsWidget;

    @postConstruct()
    protected init(): void {
        this.id = 'debug:session:' + this.model.id;
        this.title.label = this.model.label;
        this.title.closable = true;
        this.title.iconClass = 'fa debug-tab-icon';
        this.addClass('theia-session-container');
        this.toDispose.pushAll([
            this.toolbar,
            this.threads,
            this.frames,
            this.variables,
            this.breakpoints
        ]);

        const container = new ViewContainer();

        this.threads.scrollArea = container.node;
        container.addWidget(this.threads);

        this.frames.scrollArea = container.node;
        container.addWidget(this.frames);

        this.variables.scrollArea = container.node;
        container.addWidget(this.variables);

        this.breakpoints.scrollArea = container.node;
        container.addWidget(this.breakpoints);

        const layout = this.layout = new PanelLayout();
        layout.addWidget(this.toolbar);
        layout.addWidget(container);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.toolbar.focus();
    }

    getTrackableWidgets(): Widget[] {
        return [
            this.threads,
            this.frames,
            this.variables,
            this.breakpoints
        ];
    }

}
