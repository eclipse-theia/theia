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

import { DebugSession } from "../debug-model";
import { DebugSessionManager } from "../debug-session";
import { injectable, inject } from "inversify";
import { DebugProtocol } from "vscode-debugprotocol";
import { SourceOpener, DebugUtils } from "../debug-utils";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ActiveLineDecoratorProvider, BreakpointDecoratorProvider } from "./breakpoint-decorators";
import { BreakpointStorage } from "./breakpoint-storage";
import {
    EditorManager,
    EditorWidget,
    Position,
    TextEditor,
    MouseTargetType
} from "@theia/editor/lib/browser";
import { ExtDebugProtocol } from "../../common/debug-common";
import { Emitter, Event } from "@theia/core";
import { BreakpointsApplier } from "./breakpoint-applier";

/**
 * The breakpoint manager implementation.
 */
@injectable()
export class BreakpointsManager implements FrontendApplicationContribution {
    protected readonly onDidChangeBreakpointsEmitter = new Emitter<void>();

    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(SourceOpener) protected readonly sourceOpener: SourceOpener,
        @inject(ActiveLineDecoratorProvider) protected readonly lineDecorator: ActiveLineDecoratorProvider,
        @inject(BreakpointDecoratorProvider) protected readonly breakpointDecorator: BreakpointDecoratorProvider,
        @inject(BreakpointStorage) protected readonly storage: BreakpointStorage,
        @inject(BreakpointsApplier) protected readonly breakpointApplier: BreakpointsApplier,
        @inject(EditorManager) protected readonly editorManager: EditorManager
    ) { }

    onStart(): void {
        this.debugSessionManager.onDidCreateDebugSession(debugSession => this.onDebugSessionCreated(debugSession));
        this.debugSessionManager.onDidChangeActiveDebugSession(
            ([oldDebugSession, newDebugSession]) => this.onActiveDebugSessionChanged(oldDebugSession, newDebugSession));
        this.debugSessionManager.onDidDestroyDebugSession(debugSession => this.onDebugSessionDestroyed(debugSession));
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

        return this.storage.exists(id)
            .then(exists => exists ? this.storage.delete(srcBreakpoint) : this.storage.add(srcBreakpoint))
            .then(() => {
                if (debugSession) {
                    const source = DebugUtils.toSource(editor.uri, debugSession);
                    return this.breakpointApplier.applySessionBreakpoints(debugSession, source);
                }
            })
            .then(() => this.breakpointDecorator.get(debugSession && debugSession.sessionId).showDecorations(editor));
    }

    /**
     * Returns all breakpoints for the given debug session.
     * @param sessionId the debug session identifier
     */
    async get(sessionId: string | undefined): Promise<ExtDebugProtocol.AggregatedBreakpoint[]> {
        return this.storage.get().then(breakpoints => breakpoints.filter(b => b.sessionId === sessionId));
    }

    /**
     * Creates a source breakpoint for the given editor and active session.
     * @param session the current active session
     * @param editor the text editor
     * @param position the mouse position in the editor
     * @returns breakpoint
     */
    private createSourceBreakpoint(debugSession: DebugSession | undefined, editor: TextEditor, position: Position): ExtDebugProtocol.AggregatedBreakpoint {
        return {
            source: DebugUtils.toSource(editor.uri, debugSession),
            sessionId: debugSession && debugSession.sessionId,
            origin: { line: position.line }
        };
    }

    private onDebugSessionCreated(debugSession: DebugSession) {
        debugSession.on('stopped', event => this.onThreadStopped(debugSession, event));
        debugSession.on('continued', event => this.onThreadContinued(debugSession, event));

        this.assignBreakpointsTo(debugSession.sessionId);
    }

    private onDebugSessionDestroyed(debugSession: DebugSession) {
        this.unassignBreakpointsFrom(debugSession.sessionId);
    }

    private onActiveDebugSessionChanged(oldDebugSession: DebugSession | undefined, newDebugSession: DebugSession | undefined) {
        if (oldDebugSession) {
            this.lineDecorator.get(oldDebugSession.sessionId).clearDecorations();
        }

        if (newDebugSession) {
            this.lineDecorator.get(newDebugSession.sessionId).showDecorations();
        }

        this.breakpointDecorator.get(oldDebugSession && oldDebugSession.sessionId).clearDecorations();
        this.breakpointDecorator.get(newDebugSession && newDebugSession.sessionId).showDecorations();
    }

    private onThreadContinued(debugSession: DebugSession, event: DebugProtocol.ContinuedEvent): void {
        this.lineDecorator.get(debugSession.sessionId).showDecorations();
    }

    private onThreadStopped(debugSession: DebugSession, event: DebugProtocol.StoppedEvent): void {
        const body = event.body;

        if (body.threadId) {
            switch (body.reason) {
                case 'breakpoint':
                case 'entry':
                case 'step': {
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
                                this.sourceOpener.open(frame);
                            }
                        });
                    }
                    break;
                }
            }
        }
    }

    private async onEditorCreated(editor: TextEditor): Promise<void> {
        const debugSession = this.debugSessionManager.getActiveDebugSession();
        if (debugSession) {
            this.lineDecorator.get(debugSession.sessionId).showDecorations(editor);
        }
        this.breakpointDecorator.get(debugSession && debugSession.sessionId).showDecorations(editor);

        editor.onMouseDown(event => {
            switch (event.target.type) {
                case MouseTargetType.GUTTER_GLYPH_MARGIN:
                case MouseTargetType.GUTTER_VIEW_ZONE: {
                    this.toggleBreakpoint(editor, event.target.position);
                    break;
                }
            }
        });
    }

    private onActiveEditorChanged(widget: EditorWidget | undefined): void { }

    private onCurrentEditorChanged(widget: EditorWidget | undefined): void { }

    private assignBreakpointsTo(sessionId: string): Promise<void> {
        return this.reassignBreakpoints(undefined, sessionId);
    }

    private unassignBreakpointsFrom(sessionId: string): Promise<void> {
        return this.reassignBreakpoints(sessionId, undefined);
    }

    private reassignBreakpoints(oldSessionId: string | undefined, newSessionId: string | undefined): Promise<void> {
        return this.storage.get(DebugUtils.isSourceBreakpoint)
            .then(breakpoints => breakpoints.filter(b => b.sessionId === oldSessionId))
            .then(breakpoints => {
                if (newSessionId) {
                    const debugSession = this.debugSessionManager.find(newSessionId);
                    if (debugSession) {
                        return breakpoints.filter(b => DebugUtils.checkPattern(b, debugSession.configuration.breakpoints.filePatterns));
                    }
                }
                return breakpoints;
            })
            .then(breakpoints => breakpoints.map(b => {
                b.sessionId = newSessionId;
                b.created = undefined;
                return b;
            }))
            .then(breakpoints => this.storage.updateAll(breakpoints));
    }
}
