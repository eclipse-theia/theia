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
    VirtualWidget,
    SELECTED_CLASS,
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
import { h } from '@phosphor/virtualdom';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Emitter, Event } from "@theia/core";

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
        this.addClass(DebugWidget.Styles.DEBUG_CONTAINER);
    }

    @postConstruct()
    protected init() {
        this.debugSessionManager.onDidStartDebugSession(debugSession => this.onDebugSessionStarted(debugSession));
        this.debugSessionManager.onDidTerminateDebugSession(debugSession => this.onDebugSessionTerminated(debugSession));
    }

    private onDebugSessionStarted(debugSession: DebugSession): void {
        const currentTitle = this.tabBar.currentTitle;
        if (currentTitle) {
            currentTitle.owner.hide();
        }

        const widget = new DebugTargetWidget(debugSession);
        this.tabBar.addTab(widget.title);
        this.node.appendChild(widget.node);
        this.tabBar.currentTitle = widget.title;

        widget.update();
    }

    private onDebugSessionTerminated(debugSession: DebugSession) {
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
        this.debugSessionManager.destroy(title.owner.sessionId);
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
 * The debug target widget.
 * It is used as a container for the rest of widget for the specific debug target.
 */
export class DebugTargetWidget extends Widget {
    public readonly sessionId: string;
    private threads: DebugThreadsWidget;

    constructor(protected readonly debugSession: DebugSession) {
        super();
        this.sessionId = debugSession.sessionId;
        this.title.label = debugSession.configuration.name;
        this.title.closable = true;
        this.threads = new DebugThreadsWidget(debugSession);
        this.threads.onDidSelectThread(thread => { });
        this.node.appendChild(this.threads.node);
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.threads.update();
    }
}

/**
 * The debug threads widget.
 * Is it used to display list of threads.
 */
export class DebugThreadsWidget extends VirtualWidget {
    private threads: DebugProtocol.Thread[] = [];
    private selectedThreadId: number;

    private readonly onDidSelectThreadEmitter = new Emitter<DebugProtocol.Thread>();

    constructor(protected readonly debugSession: DebugSession) {
        super();
        this.id = `debug-session-${debugSession.sessionId}`;
        this.debugSession.on('stopped', (event) => this.onStoppedEvent(event));
        this.debugSession.on('continued', (event) => this.onContinuedEvent(event));
        this.debugSession.on('thread', (event) => this.onThreadEvent(event));

        this.debugSession.threads().then(response => {
            if (response.success) {
                this.threads = response.body.threads;
                this.update();
            }
        });
    }

    get onDidSelectThread(): Event<DebugProtocol.Thread> {
        return this.onDidSelectThreadEmitter.event;
    }

    protected render(): h.Child {
        // TODO: remove
        this.threads = [{ id: 1, name: "thread 1" }, { id: 2, name: "thread 2" }];

        const header = h.div({ className: "theia-header" }, "Threads");
        const items: h.Child = [];
        for (const thread of this.threads) {
            let className = DebugWidget.Styles.THREAD;
            if (thread.id === this.selectedThreadId) {
                className += ` ${DebugWidget.Styles.THREAD}`;
            }

            const item =
                h.div({
                    id: `thread-id-${thread.id}`,
                    className: className,
                    onclick: (event) => {
                        const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
                        if (selected) {
                            selected.className = `${DebugWidget.Styles.THREAD}`;
                        }

                        (event.target as HTMLDivElement).className = `${DebugWidget.Styles.THREAD} ${SELECTED_CLASS}`;
                        this.selectedThreadId = thread.id;
                        this.onDidSelectThreadEmitter.fire(thread);
                    }
                }, thread.name);
            items.push(item);
        }
        const list = h.div(items);

        return h.div({ tabindex: "0", className: DebugWidget.Styles.THREADS_CONTAINER }, header, list);
    }

    private onStoppedEvent(event: DebugProtocol.StoppedEvent): void { }

    private onContinuedEvent(event: DebugProtocol.ContinuedEvent): void { }

    private onThreadEvent(event: DebugProtocol.ThreadEvent): void {
        this.update();
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

export namespace DebugWidget {
    export namespace Styles {
        export const DEBUG_CONTAINER = 'theia-debug-container';
        export const THREADS_CONTAINER = 'theia-debug-threads-container';
        export const THREAD = 'theia-debug-thread';
    }
}
