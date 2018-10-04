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

import { DebugSession } from '../debug-model';
import { DebugSessionManager } from '../debug-session';
import { injectable, inject } from 'inversify';
import { DebugProtocol } from 'vscode-debugprotocol';
import { SourceOpener, DebugUtils } from '../debug-utils';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ActiveLineDecorator, BreakpointDecorator } from './breakpoint-decorators';
import { BreakpointStorage } from './breakpoint-marker';
import {
    EditorManager,
    EditorWidget,
    Position,
    TextEditor,
    MouseTargetType
} from '@theia/editor/lib/browser';
import { ExtDebugProtocol, DebugService } from '../../common/debug-common';
import { Emitter, Event } from '@theia/core';
import { BreakpointsApplier } from './breakpoint-applier';

/**
 * The breakpoint manager implementation.
 * When debug session is created then breakpoints are assigned to the session.
 * When session is terminated then breakpoints are unassigned from the session.
 */
@injectable()
export class BreakpointsManager implements FrontendApplicationContribution {
    protected readonly onDidChangeBreakpointsEmitter = new Emitter<void>();

    constructor(
        @inject(DebugService) protected readonly debugService: DebugService,
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(SourceOpener) protected readonly sourceOpener: SourceOpener,
        @inject(ActiveLineDecorator) protected readonly lineDecorator: ActiveLineDecorator,
        @inject(BreakpointDecorator) protected readonly breakpointDecorator: BreakpointDecorator,
        @inject(BreakpointStorage) protected readonly breakpointStorage: BreakpointStorage,
        @inject(BreakpointsApplier) protected readonly breakpointApplier: BreakpointsApplier,
        @inject(EditorManager) protected readonly editorManager: EditorManager
    ) { }

    onStart(): void {
        this.debugSessionManager.onDidCreateDebugSession(debugSession => this.onDebugSessionCreated(debugSession));
        this.debugSessionManager.onDidChangeActiveDebugSession(
            ([oldDebugSession, newDebugSession]) => this.onActiveDebugSessionChanged(oldDebugSession, newDebugSession));
        this.editorManager.onCreated(widget => this.onEditorCreated(widget.editor));
        this.editorManager.onActiveEditorChanged(widget => this.onActiveEditorChanged(widget));
        this.editorManager.onCurrentEditorChanged(widget => this.onCurrentEditorChanged(widget));
    }

    get onDidChangeBreakpoints(): Event<void> {
        return this.onDidChangeBreakpointsEmitter.event;
    }

    /**
     * Toggles breakpoint in the given editor.
     * @param editor the active text editor
     * @param position the mouse position in the editor
     */
    async toggleBreakpoint(editor: TextEditor, position: Position): Promise<void> {
        const debugSession = this.debugSessionManager.getActiveDebugSession();

        const srcBreakpoint = this.createSourceBreakpoint(debugSession, editor, position);
        const id = DebugUtils.makeBreakpointId(srcBreakpoint);

        if (this.breakpointStorage.exists(id)) {
            this.breakpointStorage.delete(srcBreakpoint);
        } else {
            this.breakpointStorage.add(srcBreakpoint);
        }

        if (debugSession) {
            const source = DebugUtils.toSource(editor.uri, debugSession);
            await this.breakpointApplier.applySessionBreakpoints(debugSession, source);
        }

        this.breakpointDecorator.applyDecorations(editor);
        this.onDidChangeBreakpointsEmitter.fire(undefined);
    }

    /**
     * Returns all breakpoints for the given debug session.
     * @param sessionId the debug session identifier
     */
    async get(sessionId: string | undefined): Promise<ExtDebugProtocol.AggregatedBreakpoint[]> {
        return this.breakpointStorage.get().filter(b => b.sessionId === sessionId);
    }

    /**
     * Returns all breakpoints.
     */
    async getAll(): Promise<ExtDebugProtocol.AggregatedBreakpoint[]> {
        return this.breakpointStorage.get();
    }

    /**
     * Creates a source breakpoint for the given editor and active session.
     * @param session the current active session
     * @param editor the text editor
     * @param position the mouse position in the editor
     * @returns breakpoint
     */
    private createSourceBreakpoint(debugSession: DebugSession | undefined, editor: TextEditor, position: Position): ExtDebugProtocol.AggregatedBreakpoint {
        const source = DebugUtils.toSource(editor.uri, debugSession);
        const sessionId = debugSession && debugSession.sessionId;
        return {
            source, sessionId,
            origin: { line: position.line + 1 }
        };
    }

    private onDebugSessionCreated(debugSession: DebugSession) {
        debugSession.on('stopped', event => this.onThreadStopped(debugSession, event));
        debugSession.on('continued', event => this.onThreadContinued(debugSession, event));
        debugSession.on('terminated', event => this.onTerminated(debugSession, event));
        debugSession.on('configurationDone', event => this.onConfigurationDone(debugSession, event));
        debugSession.on('breakpoint', event => this.onBreakpoint(debugSession, event));

        this.assignBreakpointsToSession(debugSession);
    }

    private assignBreakpointsToSession(debugSession: DebugSession) {
        const breakpoints = this.breakpointStorage.get(DebugUtils.isSourceBreakpoint)
            .filter(b => b.sessionId === undefined)
            .map(b => {
                b.sessionId = debugSession.sessionId;
                b.created = undefined;
                return b;
            });
        this.breakpointStorage.update(breakpoints);
        this.onDidChangeBreakpointsEmitter.fire(undefined);
    }

    private onConfigurationDone(debugSession: DebugSession, event: ExtDebugProtocol.ConfigurationDoneEvent): void {
        this.breakpointDecorator.applyDecorations();
        this.lineDecorator.applyDecorations();
    }

    private onTerminated(debugSession: DebugSession, event: DebugProtocol.TerminatedEvent): void {
        this.lineDecorator.applyDecorations();
        this.unassignBreakpointsFromSession(debugSession);
        this.breakpointDecorator.applyDecorations();
    }

    private unassignBreakpointsFromSession(debugSession: DebugSession) {
        const breakpoints = this.breakpointStorage.get(DebugUtils.isSourceBreakpoint)
            .filter(b => b.sessionId === debugSession.sessionId)
            .map(b => {
                b.created = undefined;
                b.sessionId = undefined;
                return b;
            });

        this.breakpointStorage.update(breakpoints);
        this.onDidChangeBreakpointsEmitter.fire(undefined);
    }

    private onActiveDebugSessionChanged(oldDebugSession: DebugSession | undefined, newDebugSession: DebugSession | undefined) {
        this.lineDecorator.applyDecorations();
        this.breakpointDecorator.applyDecorations();
    }

    private onBreakpoint(debugSession: DebugSession, event: DebugProtocol.BreakpointEvent): void {
        const breakpoint = event.body.breakpoint;

        const breakpoints = this.breakpointStorage.get(DebugUtils.isSourceBreakpoint)
            .filter(b => b.sessionId === debugSession.sessionId)
            .filter(b => {
                if (breakpoint.id && b.created && b.created.id === breakpoint.id) {
                    return true;
                }

                if (!breakpoint.source) {
                    return false;
                }

                const srcBrk = b.origin as DebugProtocol.SourceBreakpoint;
                return DebugUtils.checkUri(b, DebugUtils.toUri(breakpoint.source))
                    && srcBrk.line === breakpoint.line
                    && srcBrk.column === breakpoint.column;
            });

        const sourceBreakpoint = breakpoints[0];
        switch (event.body.reason) {
            case 'new':
            case 'changed': {
                if (sourceBreakpoint) {
                    sourceBreakpoint.created = breakpoint;
                    this.breakpointStorage.update(sourceBreakpoint);
                } else {
                    this.breakpointStorage.update({
                        sessionId: debugSession.sessionId,
                        source: breakpoint.source,
                        created: breakpoint,
                        origin: {
                            line: breakpoint.line!,
                            column: breakpoint.column
                        }
                    });
                }
                break;
            }
            case 'removed': {
                if (sourceBreakpoint) {
                    this.breakpointStorage.delete(sourceBreakpoint);
                }
                break;
            }
        }

        this.breakpointDecorator.applyDecorations();
        this.onDidChangeBreakpointsEmitter.fire(undefined);
    }

    private onThreadContinued(debugSession: DebugSession, event: DebugProtocol.ContinuedEvent): void {
        this.lineDecorator.applyDecorations();
    }

    private onThreadStopped(debugSession: DebugSession, event: DebugProtocol.StoppedEvent): void {
        const body = event.body;

        if (body.threadId) {
            switch (body.reason) {
                case 'exception':
                case 'breakpoint':
                case 'entry':
                case 'step':
                case 'user request': {
                    const activeDebugSession = this.debugSessionManager.getActiveDebugSession();
                    if (activeDebugSession && activeDebugSession.sessionId === debugSession.sessionId) {
                        const args: DebugProtocol.StackTraceArguments = {
                            threadId: body.threadId,
                            startFrame: 0,
                            levels: 1
                        };

                        debugSession.stacks(args).then(response => {
                            const frame = response.body.stackFrames[0];
                            if (frame) {
                                this.sourceOpener.open(frame).then(() => this.lineDecorator.applyDecorations());
                            }
                        });
                    }
                    break;
                }
            }
        }
    }

    private async onEditorCreated(editor: TextEditor): Promise<void> {
        this.lineDecorator.applyDecorations();
        this.breakpointDecorator.applyDecorations(editor);

        editor.onMouseDown(event => {
            switch (event.target.type) {
                case MouseTargetType.GUTTER_GLYPH_MARGIN:
                case MouseTargetType.GUTTER_VIEW_ZONE: {
                    if (event.target.position) {
                        this.toggleBreakpoint(editor, event.target.position);
                    }
                    break;
                }
            }
        });
    }

    private onActiveEditorChanged(widget: EditorWidget | undefined): void { }

    private onCurrentEditorChanged(widget: EditorWidget | undefined): void { }
}
