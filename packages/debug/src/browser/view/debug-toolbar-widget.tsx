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

import { inject, postConstruct } from 'inversify';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Message } from '@phosphor/messaging';
import { CommandRegistry } from '@theia/core/lib/common';
import { DebugSession } from '../debug-model';
import { DEBUG_COMMANDS } from '../debug-command';
import { BaseWidget } from '@theia/core/lib/browser/widgets';
import { Disposable } from '@theia/core';
import { DebugSessionManager } from '../debug-session';
import { DebugContext, DebugWidget } from './debug-view-common';
import { DisposableCollection } from '@theia/core';

/**
 * Debug toolbar.
 */
export class DebugToolBar extends BaseWidget implements DebugWidget {
    private _debugContext: DebugContext | undefined;
    protected toolbarContainer: HTMLElement;

    private readonly sessionDisposableEntries = new DisposableCollection();

    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry) {
        super();

        this.id = this.createId();
        this.addClass('debug-toolbar');
    }

    @postConstruct()
    protected init() {
        this.toolbarContainer = document.createElement('div');
        this.node.appendChild(this.toolbarContainer);
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
            const eventListener = () => this.update();
            this.debugSession!.on('*', eventListener);
            this.sessionDisposableEntries.push(Disposable.create(() => this.debugSession!.removeListener('*', eventListener)));

            this.sessionDisposableEntries.push(this.debugSessionManager.onDidDestroyDebugSession((debugSession: DebugSession) => this.onDebugSessionDestroyed(debugSession)));
        }

        this.update();
    }

    protected onDebugSessionDestroyed(debugSession: DebugSession) {
        if (this.debugSession && debugSession.sessionId === this.debugSession.sessionId) {
            this.update();
        }
    }

    protected onUpdateRequest(msg: Message) {
        super.onUpdateRequest(msg);
        ReactDOM.render(<React.Fragment>{this.render()}</React.Fragment>, this.toolbarContainer);
    }

    protected render(): React.ReactNode {
        const stopButton = this.renderButton(DEBUG_COMMANDS.STOP.id);
        const resumeAllButton = this.renderButton(DEBUG_COMMANDS.RESUME_ALL_THREADS.id);
        const suspendAllButton = this.renderButton(DEBUG_COMMANDS.SUSPEND_ALL_THREADS.id);
        const stepOverButton = this.renderButton(DEBUG_COMMANDS.STEP.id);
        const stepIntoButton = this.renderButton(DEBUG_COMMANDS.STEPIN.id);
        const stepOutButton = this.renderButton(DEBUG_COMMANDS.STEPOUT.id);
        return <div className='button-container'>{stopButton}{resumeAllButton}{suspendAllButton}{stepOverButton}{stepIntoButton}{stepOutButton}</div>;
    }

    protected renderButton(commandId: string): React.ReactNode {
        const command = this.commandRegistry.getCommand(commandId);
        if (!command) {
            return '';
        }

        const enabled = this.commandRegistry.isEnabled(commandId) ? 'enabled' : '';
        const clickHandler = () => this.commandRegistry.executeCommand(commandId);

        return <span className={`btn ${enabled} ${command.iconClass}`} title={`${command.label}`} onClick={clickHandler}></span>;
    }

    private createId(): string {
        return 'debug-toolbar'
            + (this.debugSession ? `-${this.debugSession.sessionId}` : '');
    }

    private get debugSession(): DebugSession | undefined {
        return this._debugContext && this._debugContext.debugSession;
    }
}
