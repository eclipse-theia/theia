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

import { injectable, inject, postConstruct, interfaces, Container } from '@theia/core/shared/inversify';
import { MenuPath, Disposable, CommandRegistry, MenuModelRegistry, DisposableCollection, Command } from '@theia/core/lib/common';
import { SourceTreeWidget, TreeElementNode } from '@theia/core/lib/browser/source-tree';
import { DebugVariablesSource } from './debug-variables-source';
import { DebugViewModel } from './debug-view-model';
import { nls } from '@theia/core/lib/common/nls';
import { MouseEvent } from '@theia/core/shared/react';
import { SelectableTreeNode, TreeNode, TreeSelection } from '@theia/core/lib/browser';
import { DebugVariable } from '../console/debug-console-items';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DataBreakpoint, DataBreakpointSource, DataBreakpointSourceType } from '../breakpoint/breakpoint-marker';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugSession } from '../debug-session';
import { DebugStackFrame } from '../model/debug-stack-frame';

@injectable()
export class DebugVariablesWidget extends SourceTreeWidget {

    static CONTEXT_MENU: MenuPath = ['debug-variables-context-menu'];
    static EDIT_MENU: MenuPath = [...DebugVariablesWidget.CONTEXT_MENU, 'a_edit'];
    static WATCH_MENU: MenuPath = [...DebugVariablesWidget.CONTEXT_MENU, 'b_watch'];
    static DATA_BREAKPOINT_MENU: MenuPath = [...DebugVariablesWidget.CONTEXT_MENU, 'c_data_breakpoints'];
    static FACTORY_ID = 'debug:variables';
    static override createContainer(parent: interfaces.Container): Container {
        const child = SourceTreeWidget.createContainer(parent, {
            contextMenuPath: DebugVariablesWidget.CONTEXT_MENU,
            virtualized: false,
            scrollIfActive: true
        });
        child.bind(DebugVariablesSource).toSelf();
        child.unbind(SourceTreeWidget);
        child.bind(DebugVariablesWidget).toSelf();
        return child;
    }
    static createWidget(parent: interfaces.Container): DebugVariablesWidget {
        return DebugVariablesWidget.createContainer(parent).get(DebugVariablesWidget);
    }

    @inject(DebugViewModel)
    protected readonly viewModel: DebugViewModel;

    @inject(DebugVariablesSource)
    protected readonly variables: DebugVariablesSource;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(BreakpointManager)
    protected readonly breakpointManager: BreakpointManager;

    @inject(DebugSessionManager)
    protected readonly sessionManager: DebugSessionManager;

    protected stackFrame: DebugStackFrame | undefined;
    protected readonly statePerSession = new Map<string, DebugVariablesWidgetSessionState>();

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = DebugVariablesWidget.FACTORY_ID + ':' + this.viewModel.id;
        this.title.label = nls.localizeByDefault('Variables');
        this.toDispose.push(this.variables);
        this.source = this.variables;
        this.toDispose.push(this.sessionManager.onDidFocusStackFrame(stackFrame => this.handleDidFocusStackFrame(stackFrame)));
        this.toDispose.push(this.sessionManager.onDidDestroyDebugSession(session => this.handleDidDestroyDebugSession(session)));
    }

    protected handleDidFocusStackFrame(stackFrame: DebugStackFrame | undefined): void {
        if (this.stackFrame !== stackFrame) {
            if (this.stackFrame) {
                const sessionState = this.getOrCreateSessionState(this.stackFrame.session);
                sessionState.setStateForStackFrame(this.stackFrame, this.superStoreState());
            }
            if (stackFrame) {
                const sessionState = this.statePerSession.get(stackFrame.session.id);
                if (sessionState) {
                    const state = sessionState.getStateForStackFrame(stackFrame);
                    if (state) {
                        this.superRestoreState(state);
                    }
                }
            }
            this.stackFrame = stackFrame;
        }
    }

    protected getOrCreateSessionState(session: DebugSession): DebugVariablesWidgetSessionState {
        let sessionState = this.statePerSession.get(session.id);
        if (!sessionState) {
            sessionState = this.newSessionState();
            this.statePerSession.set(session.id, sessionState);
        }
        return sessionState;
    }

    protected newSessionState(): DebugVariablesWidgetSessionState {
        return new DebugVariablesWidgetSessionState();
    }

    protected handleDidDestroyDebugSession(session: DebugSession): void {
        this.statePerSession.delete(session.id);
    }

    protected override handleContextMenuEvent(node: TreeNode | undefined, event: MouseEvent<HTMLElement>): void {
        this.doHandleContextMenuEvent(node, event);
    }

    protected async doHandleContextMenuEvent(node: TreeNode | undefined, event: MouseEvent<HTMLElement>): Promise<void> {
        event.stopPropagation();
        event.preventDefault();
        if (!SelectableTreeNode.is(node) || !TreeElementNode.is(node)) { return; }
        // Keep the selection for the context menu, if the widget support multi-selection and the right click happens on an already selected node.
        if (!this.props.multiSelect || !node.selected) {
            const type = !!this.props.multiSelect && this.hasCtrlCmdMask(event) ? TreeSelection.SelectionType.TOGGLE : TreeSelection.SelectionType.DEFAULT;
            this.model.addSelection({ node, type });
        }
        this.focusService.setFocus(node);
        const contextMenuPath = this.props.contextMenuPath;
        if (contextMenuPath) {
            const { x, y } = event.nativeEvent;
            const args = this.toContextMenuArgs(node);
            const target = event.currentTarget;
            const toDisposeOnHide = await this.getVariableCommands(node);
            setTimeout(() => this.contextMenuRenderer.render({
                menuPath: contextMenuPath,
                context: target,
                anchor: { x, y },
                args,
                onHide: () => toDisposeOnHide.dispose()
            }), 10);
        }
    }

    protected async getVariableCommands(node: TreeElementNode): Promise<Disposable> {
        const selectedElement = node.element;
        const { viewModel: { currentSession } } = this;
        if (!currentSession?.capabilities.supportsDataBreakpoints || !(selectedElement instanceof DebugVariable)) {
            return Disposable.NULL;
        }
        const { name, parent: { reference } } = selectedElement;
        const dataBreakpointInfo = (await currentSession.sendRequest('dataBreakpointInfo', { name, variablesReference: reference })).body;
        // eslint-disable-next-line no-null/no-null
        if (dataBreakpointInfo.dataId === null) {
            return Disposable.NULL;
        }
        const source: DataBreakpointSource = { type: DataBreakpointSourceType.Variable, variable: name };
        return new DisposableCollection(
            this.commandRegistry.registerCommand(Command.toDefaultLocalizedCommand({
                id: `break-on-access:${currentSession.id}:${name}`,
                label: 'Break on Value Access'
            }), {
                execute: () => this.breakpointManager.addDataBreakpoint(DataBreakpoint.create(
                    { accessType: 'readWrite', dataId: dataBreakpointInfo.dataId! },
                    dataBreakpointInfo,
                    source
                )),
                isEnabled: () => !!dataBreakpointInfo.accessTypes?.includes('readWrite'),
            }),
            this.menuRegistry.registerMenuAction(DebugVariablesWidget.DATA_BREAKPOINT_MENU, { commandId: `break-on-access:${currentSession.id}:${name}`, order: 'c' }),
            this.commandRegistry.registerCommand(Command.toDefaultLocalizedCommand({
                id: `break-on-read:${currentSession.id}:${name}`,
                label: 'Break on Value Read'
            }), {
                execute: () => this.breakpointManager.addDataBreakpoint(DataBreakpoint.create(
                    { accessType: 'read', dataId: dataBreakpointInfo.dataId! },
                    dataBreakpointInfo,
                    source
                )),
                isEnabled: () => !!dataBreakpointInfo.accessTypes?.includes('read'),
            }),
            this.menuRegistry.registerMenuAction(DebugVariablesWidget.DATA_BREAKPOINT_MENU, { commandId: `break-on-read:${currentSession.id}:${name}`, order: 'a' }),
            this.commandRegistry.registerCommand(Command.toDefaultLocalizedCommand({
                id: `break-on-write:${currentSession.id}:${name}`,
                label: 'Break on Value Change'
            }), {
                execute: () => this.breakpointManager.addDataBreakpoint(DataBreakpoint.create(
                    { accessType: 'write', dataId: dataBreakpointInfo.dataId! },
                    dataBreakpointInfo,
                    source
                )),
                isEnabled: () => !!dataBreakpointInfo.accessTypes?.includes('write'),
            }),
            this.menuRegistry.registerMenuAction(DebugVariablesWidget.DATA_BREAKPOINT_MENU, { commandId: `break-on-write:${currentSession.id}:${name}`, order: 'b' }),
        );
    }
}

export class DebugVariablesWidgetSessionState {
    protected readonly statePerStackFrame = new Map<string, object>();

    setStateForStackFrame(stackFrame: DebugStackFrame, state: object): void {
        this.statePerStackFrame.set(stackFrame.id, state);
    }

    getStateForStackFrame(stackFrame: DebugStackFrame): object | undefined {
        return this.statePerStackFrame.get(stackFrame.id);
    }
}
