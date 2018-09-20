/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import {
    Widget,
    Message,
    ApplicationShell,
    WidgetManager,
    FrontendApplicationContribution,
    BaseWidget
} from '@theia/core/lib/browser';
import { DebugSessionManager } from '../debug-session';
import { DebugSession } from '../debug-model';
import { inject, injectable, postConstruct } from 'inversify';
import { DebugThreadsWidget } from './debug-threads-widget';
import { DebugStackFramesWidget } from './debug-stack-frames-widget';
import { DebugBreakpointsWidget } from './debug-breakpoints-widget';
import { DebugVariablesWidget } from './debug-variables-widget';
import { ExtDebugProtocol } from '../../common/debug-common';
import { Disposable } from '@theia/core';
import { DebugStyles } from './base/debug-styles';
import { DebugToolBar } from './debug-toolbar-widget';

export const DEBUG_FACTORY_ID = 'debug';

/**
 * The debug target widget. It is used as a container
 * for the rest of widgets for the specific debug target.
 */
@injectable()
export class DebugWidget extends BaseWidget {
    private readonly HORIZONTALS_IDS = ['theia-bottom-content-panel', 'theia-main-content-panel'];
    private readonly widgets: Widget[];

    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(DebugSession) protected readonly debugSession: DebugSession,
        @inject(DebugThreadsWidget) protected readonly threads: DebugThreadsWidget,
        @inject(DebugStackFramesWidget) protected readonly frames: DebugStackFramesWidget,
        @inject(DebugBreakpointsWidget) protected readonly breakpoints: DebugBreakpointsWidget,
        @inject(DebugVariablesWidget) protected readonly variables: DebugVariablesWidget,
        @inject(DebugToolBar) protected readonly toolbar: DebugToolBar
    ) {
        super();

        this.id = `debug-panel-${debugSession.sessionId}`;
        this.title.label = debugSession.configuration.name;
        this.title.caption = debugSession.configuration.name;
        this.title.closable = true;
        this.title.iconClass = 'fa debug-tab-icon';
        this.addClass(DebugStyles.DEBUG_CONTAINER);
        this.widgets = [this.toolbar, this.variables, this.threads, this.frames, this.breakpoints];
    }

    @postConstruct()
    protected init() {
        const connectedEventListener = (event: ExtDebugProtocol.ConnectedEvent) => this.onConnectedEvent(event);

        this.debugSession.on('connected', connectedEventListener);
        this.toDisposeOnDetach.push(Disposable.create(() => this.debugSession.removeListener('connected', connectedEventListener)));

        this.widgets.forEach(w => w.node.onfocus = () => {
            this.debugSessionManager.setActiveDebugSession(this.debugSession.sessionId);
        });

        this.update();
    }

    private onConnectedEvent(event: ExtDebugProtocol.ConnectedEvent): void {
        this.update();
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.widgets.forEach(w => w.update());
    }

    protected onAfterAttach(msg: Message): void {
        this.node.setAttribute('orientation',
            (this.HORIZONTALS_IDS.some((value, index, array) => !!this.parent && value === this.parent.node.id))
                ? 'horizontal'
                : 'vertical');

        this.widgets.forEach(w => Widget.attach(w, this.node));
        super.onAfterAttach(msg);
    }

    protected onBeforeDetach(msg: Message): void {
        super.onBeforeDetach(msg);
        this.widgets.forEach(w => Widget.detach(w));
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.widgets.forEach(w => w.activate());
    }
}

@injectable()
export class DebugFrontendContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(WidgetManager) protected readonly widgetManager: WidgetManager;
    @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager;

    @postConstruct()
    protected init() {
        this.debugSessionManager.onDidCreateDebugSession(debugSession => this.onDebugSessionCreated(debugSession));
        this.debugSessionManager.onDidDestroyDebugSession(debugSession => this.onDebugSessionDestroyed(debugSession));
        this.debugSessionManager.findAll().forEach(debugSession => this.createDebugWidget(debugSession));
    }

    initialize(): void { }

    private async onDebugSessionCreated(debugSession: DebugSession): Promise<void> {
        this.createDebugWidget(debugSession);
    }

    private async onDebugSessionDestroyed(debugSession: DebugSession): Promise<void> { }

    private async createDebugWidget(debugSession: DebugSession): Promise<void> {
        const { sessionId } = debugSession;
        const options: DebugWidgetOptions = { sessionId };
        const widget = <DebugWidget>await this.widgetManager.getOrCreateWidget(DEBUG_FACTORY_ID, options);

        const tabBar = this.shell.getTabBarFor(widget);
        if (!tabBar) {
            this.shell.addWidget(widget, { area: 'left' });
        }
        this.shell.activateWidget(widget.id);
    }
}

/**
 * Debug widget options. (JSON)
 */
export const DebugWidgetOptions = Symbol('DebugWidgetOptions');
export interface DebugWidgetOptions {
    /**
     * Debug session.
     */
    readonly sessionId: string;
}
