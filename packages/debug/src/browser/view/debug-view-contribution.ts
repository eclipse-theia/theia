/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import {
    AbstractViewContribution,
    TabBar,
    Panel,
    TabBarRenderer,
    TabBarRendererFactory,
    SideTabBar,
    LEFT_RIGHT_AREA_CLASS,
    Widget,
    Message
} from "@theia/core/lib/browser";
import { DebugSessionManager, DebugSession } from "../debug-session";
import { DEBUG_SESSION_CONTEXT_MENU } from "../debug-command";
import { inject, injectable, postConstruct } from "inversify";
import { DebugThreadsWidget } from "./debug-threads-widget";
import { DebugStackFramesWidget } from "./debug-stack-frames-widget";
import { DebugBreakpointsWidget } from "./debug-breakpoints-widget";

export const DEBUG_FACTORY_ID = 'debug';

/**
 * The panel which contains all debug target widgets.
 */
@injectable()
export class DebugWidget extends Panel {
    private readonly tabBar: SideTabBar;

    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(TabBarRendererFactory) protected readonly tabBarRendererFactory: () => TabBarRenderer) {
        super();

        this.id = DEBUG_FACTORY_ID;
        this.title.label = 'Debug';
        this.title.closable = true;
        this.title.iconClass = 'fa fa-bug';
        this.tabBar = this.createTabBar();
        this.addClass(Styles.DEBUG_PANEL);
    }

    @postConstruct()
    protected init() {
        this.debugSessionManager.onDidCreateDebugSession(debugSession => this.onDebugSessionCreated(debugSession));
        this.debugSessionManager.onDidDestroyDebugSession(debugSession => this.onDebugSessionDestroyed(debugSession));

        this.debugSessionManager.findAll().forEach(debugSession => {
            this.onDebugSessionCreated(debugSession);
            this.tabBar.titles
                .filter(title => (title.owner as DebugTargetWidget).sessionId === debugSession.sessionId)
                .forEach(title => title.owner.update());
        });
    }

    protected onActivateRequest(msg: Message) {
        super.onActivateRequest(msg);
        this.tabBar.update();
    }

    private onDebugSessionCreated(debugSession: DebugSession): void {
        const currentTitle = this.tabBar.currentTitle;
        if (currentTitle) {
            currentTitle.owner.hide();
        }

        const widget = new DebugTargetWidget(debugSession);
        this.tabBar.addTab(widget.title);
        this.tabBar.currentTitle = widget.title;
        this.node.appendChild(widget.node);

        debugSession.on("connected", () => {
            this.tabBar.titles
                .filter(title => (title.owner as DebugTargetWidget).sessionId === debugSession.sessionId)
                .forEach(title => title.owner.update());
        });
    }

    private onDebugSessionDestroyed(debugSession: DebugSession) {
        this.tabBar.titles
            .filter(title => (title.owner as DebugTargetWidget).sessionId === debugSession.sessionId)
            .forEach(title => {
                this.node.removeChild(title.owner.node);
                this.tabBar.removeTab(title);
            });
    }

    private createTabBar(): SideTabBar {
        const renderer = this.tabBarRendererFactory();
        const tabBar = new SideTabBar({
            orientation: 'vertical',
            insertBehavior: 'none',
            removeBehavior: 'select-previous-tab',
            allowDeselect: false,
            tabsMovable: false,
            renderer: renderer,
            handlers: ['drag-thumb', 'keyboard', 'wheel', 'touch'],
            useBothWheelAxes: true,
            scrollYMarginOffset: 8,
            suppressScrollX: true
        });
        renderer.tabBar = tabBar;
        renderer.contextMenuPath = DEBUG_SESSION_CONTEXT_MENU;
        tabBar.addClass('theia-app-left');
        tabBar.addClass(LEFT_RIGHT_AREA_CLASS);
        tabBar.currentChanged.connect(this.onCurrentTabChanged, this);
        tabBar.tabCloseRequested.connect(this.onTabCloseRequested, this);
        this.addWidget(tabBar);
        return tabBar;
    }

    protected onTabCloseRequested(sender: SideTabBar, { title }: TabBar.ITabCloseRequestedArgs<DebugTargetWidget>): void {
        const session = this.debugSessionManager.find(title.owner.sessionId);
        if (session) {
            session.disconnect();
        }
    }

    protected onCurrentTabChanged(sender: SideTabBar, { previousTitle, currentTitle }: TabBar.ICurrentChangedArgs<DebugTargetWidget>): void {
        if (previousTitle) {
            previousTitle.owner.hide();
        }

        if (currentTitle) {
            currentTitle.owner.show();
            this.debugSessionManager.setActiveDebugSession(currentTitle.owner.sessionId);
        }
    }
}

/**
 * The debug target widget. It is used as a container
 * for the rest of widgets for the specific debug target.
 */
export class DebugTargetWidget extends Widget {
    public readonly sessionId: string;
    private threads: DebugThreadsWidget;
    private stackFrames: DebugStackFramesWidget;
    private breakpoints: DebugBreakpointsWidget;

    constructor(protected readonly debugSession: DebugSession) {
        super();
        this.sessionId = debugSession.sessionId;
        this.title.label = debugSession.configuration.name;
        this.title.closable = true;
        this.addClass(Styles.DEBUG_TARGET);

        this.stackFrames = new DebugStackFramesWidget(debugSession);
        this.stackFrames.onDidSelectStackFrame(stackFrameId => { });

        this.threads = new DebugThreadsWidget(debugSession);
        this.threads.onDidSelectThread(threadId => this.stackFrames.threadId = threadId);

        this.breakpoints = new DebugBreakpointsWidget(debugSession);

        this.node.appendChild(this.threads.node);
        this.node.appendChild(this.stackFrames.node);
        this.node.appendChild(this.breakpoints.node);
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.threads.update();
        this.stackFrames.update();
        this.breakpoints.update();
    }
}

@injectable()
export class DebugViewContribution extends AbstractViewContribution<DebugWidget> {
    constructor() {
        super({
            widgetId: DEBUG_FACTORY_ID,
            widgetName: 'Debug',
            defaultWidgetOptions: {
                area: 'bottom',
                rank: 500
            },
            toggleCommandId: 'debug.view.toggle',
            toggleKeybinding: 'ctrlcmd+alt+d'
        });
    }
}

namespace Styles {
    export const DEBUG_PANEL = 'theia-debug-panel';
    export const DEBUG_TARGET = 'theia-debug-target';
}
