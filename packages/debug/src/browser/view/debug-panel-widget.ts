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
    BaseWidget,
    StatefulWidget
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
import { DebugStyles, DebugWidget, DebugContext, DebugWidgetOptions } from './debug-view-common';
import { DebugToolBar } from './debug-toolbar-widget';
import { DebugSelectionService } from './debug-selection-service';
import { DisposableCollection } from '@theia/core';
import { UUID } from '@phosphor/coreutils';

export const DEBUG_FACTORY_ID = 'debug';

/**
 * The debug target widget. It is used as a container
 * for the rest of widgets for the specific debug target.
 */
@injectable()
export class DebugPanelWidget extends BaseWidget implements DebugWidget, StatefulWidget {
    readonly panelId: string;

    private _debugContext: DebugContext | undefined;
    private readonly sessionDisposableEntries = new DisposableCollection();
    private readonly HORIZONTALS_IDS = ['theia-bottom-content-panel', 'theia-main-content-panel'];
    private readonly widgets: DebugWidget[];

    constructor(
        @inject(DebugWidgetOptions) protected readonly options: DebugWidgetOptions,
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(DebugThreadsWidget) protected readonly threads: DebugThreadsWidget,
        @inject(DebugStackFramesWidget) protected readonly frames: DebugStackFramesWidget,
        @inject(DebugBreakpointsWidget) protected readonly breakpoints: DebugBreakpointsWidget,
        @inject(DebugVariablesWidget) protected readonly variables: DebugVariablesWidget,
        @inject(DebugToolBar) protected readonly toolbar: DebugToolBar
    ) {
        super();

        this.id = this.createId();
        this.title.closable = true;
        this.title.iconClass = 'fa debug-tab-icon';
        this.panelId = options.panelId;
        this.addClass(DebugStyles.DEBUG_CONTAINER);
        this.widgets = [this.toolbar, this.variables, this.threads, this.frames, this.breakpoints];
    }

    dispose(): void {
        this.sessionDisposableEntries.dispose();
        super.dispose();
    }

    get debugContext(): DebugContext | undefined {
        return this._debugContext;
    }

    set debugContext(debugContext: DebugContext | undefined) {
        this.sessionDisposableEntries.dispose();
        this._debugContext = debugContext;
        this.id = this.createId();

        if (debugContext) {
            const debugSession = debugContext.debugSession;

            this.title.label = debugSession.configuration.name;
            this.title.caption = debugSession.configuration.name;

            const connectedEventListener = (event: ExtDebugProtocol.ConnectedEvent) => this.onConnectedEvent(event);
            debugSession.on('connected', connectedEventListener);
            this.sessionDisposableEntries.push(Disposable.create(() => debugSession.removeListener('connected', connectedEventListener)));

            this.widgets.forEach(w => w.node.onfocus = () => {
                this.debugSessionManager.setActiveDebugSession(debugSession.sessionId);
            });
        }

        this.widgets.forEach(widget => widget.debugContext = debugContext);
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

    private createId(): string {
        return this.id = 'debug-panel' + (this.debugContext ? `${this.debugContext.debugSession.sessionId}` : '');
    }

    storeState(): object {
        return { titleLabel: this.title.label };
    }

    restoreState(oldState: object) {
        const state = oldState as { titleLabel: string };
        this.title.label = state.titleLabel;
        this.update();
    }
}

@injectable()
export class DebugPanelHandler implements FrontendApplicationContribution {
    private readonly sessionId2panelId = new Map<string, string>();

    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(WidgetManager) protected readonly widgetManager: WidgetManager;
    @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager;
    @inject(DebugSelectionService) protected readonly debugSelectionService: DebugSelectionService;

    @postConstruct()
    protected init() {
        this.debugSessionManager.onDidCreateDebugSession(debugSession => this.showPanel(debugSession));
        this.debugSessionManager.onDidDestroyDebugSession(debugSession => this.onDebugSessionDestroyed(debugSession));
        this.debugSessionManager.findAll().forEach(debugSession => this.showPanel(debugSession));
    }

    initialize(): void { }

    private onDebugSessionDestroyed(debugSession: DebugSession): void {
        this.sessionId2panelId.delete(debugSession.sessionId);
    }

    async showPanel(debugSession: DebugSession): Promise<void> {
        let panel;
        let panelId = this.sessionId2panelId.get(debugSession.sessionId);
        if (panelId) {
            panel = await this.getPanel(panelId);
        } else {
            panel = await this.findAnyPanel();
            if (!panel) {
                panelId = UUID.uuid4();
                panel = await this.getPanel(panelId);
            } else {
                panelId = (panel as DebugPanelWidget).panelId;
            }

            this.sessionId2panelId.set(debugSession.sessionId, panelId);
            this.showPanelInTabBar(panel);
            this.injectDebugContext(panel, debugSession);
        }
    }

    private async findAnyPanel(): Promise<Widget | undefined> {
        const panels = await this.widgetManager.getWidgets(DEBUG_FACTORY_ID);
        return panels.find((panel: Widget) => {
            const debugContext = (panel as DebugWidget).debugContext;
            const debugSession = debugContext && debugContext.debugSession;
            return !!debugSession && debugSession.state.isTerminated;
        });
    }

    private async getPanel(panelId: string): Promise<Widget> {
        const options: DebugWidgetOptions = { panelId };
        return <DebugPanelWidget>await this.widgetManager.getOrCreateWidget(DEBUG_FACTORY_ID, options);
    }

    private injectDebugContext(panel: Widget, debugSession: DebugSession): void {
        const debugSelection = this.debugSelectionService.get(debugSession.sessionId);
        (panel as DebugWidget).debugContext = { debugSession, debugSelection };
    }

    private showPanelInTabBar(panel: Widget): void {
        const tabBar = this.shell.getTabBarFor(panel);
        if (!tabBar) {
            this.shell.addWidget(panel, { area: 'left' });
        }
        this.shell.activateWidget(panel.id);
    }
}
