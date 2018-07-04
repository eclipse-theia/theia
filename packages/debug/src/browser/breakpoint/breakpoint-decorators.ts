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

import { injectable, inject, postConstruct } from "inversify";
import {
    Range,
    EditorDecorator,
    EditorDecorationOptions,
    TextEditor,
    Position,
    EditorManager
} from "@theia/editor/lib/browser";
import { DebugProtocol } from "vscode-debugprotocol";
import { DebugSessionManager } from "../debug-session";
import { DebugSession } from "../debug-model";
import { DebugUtils } from "../debug-utils";
import { BreakpointStorage } from "./breakpoint-storage";

const ActiveLineDecoration = <EditorDecorationOptions>{
    isWholeLine: true,
    className: 'theia-debug-active-line',
};

/**
 * Per session [Active line decorator](#ActiveLineDecorator) provider.
 */
@injectable()
export class ActiveLineDecoratorProvider {
    private readonly decorators = new Map<string, ActiveLineDecorator>();

    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(EditorManager) protected readonly editorManager: EditorManager) { }

    @postConstruct()
    protected init() {
        this.debugSessionManager.onDidPreCreateDebugSession(sessionId => this.onDebugSessionPreCreated(sessionId));
        this.debugSessionManager.onDidDestroyDebugSession(debugSession => this.onDebugSessionDestroyed(debugSession));
    }

    get(sessionId: string): ActiveLineDecorator {
        const decorator = this.decorators.get(sessionId);
        if (!decorator) {
            throw new Error(`Decorator is not initialized for the debug session: '${sessionId}'`);
        }

        return decorator;
    }

    private onDebugSessionPreCreated(sessionId: string) {
        const decorator = new ActiveLineDecorator(sessionId, this.debugSessionManager, this.editorManager);
        this.decorators.set(sessionId, decorator);
    }

    private onDebugSessionDestroyed(debugSession: DebugSession) {
        const decorator = this.decorators.get(debugSession.sessionId);
        if (decorator) {
            decorator.clearDecorations();
            this.decorators.delete(debugSession.sessionId);
        }
    }
}

/**
 * Highlight active debug line in the editors.
 */
export class ActiveLineDecorator extends EditorDecorator {
    constructor(
        protected readonly sessionId: string,
        protected readonly debugSessionManager: DebugSessionManager,
        protected readonly editorManager: EditorManager) {
        super();
    }

    showDecorations(editor?: TextEditor): void {
        const session = this.debugSessionManager.find(this.sessionId);
        if (!session) {
            return;
        }

        for (const threadId of session.state.stoppedThreadIds) {
            session.stacks({ threadId, levels: 1 }).then(response => {
                const frame = response.body.stackFrames[0];
                if (!frame || !frame.source) {
                    return;
                }

                const uri = DebugUtils.toUri(frame.source);

                if (editor) {
                    if (editor.uri.toString() === uri.toString()) {
                        this.doShow(editor, frame);
                    }
                } else {
                    this.editorManager.getByUri(uri).then(widget => {
                        if (widget) {
                            this.doShow(widget.editor, frame);
                        }
                    });
                }
            });
        }
    }

    clearDecorations(editor?: TextEditor) {
        if (editor) {
            this.setDecorations(editor, []);
        } else {
            this.editorManager.all.forEach(widget => this.setDecorations(widget.editor, []));
        }
    }

    private doShow(editor: TextEditor, frame: DebugProtocol.StackFrame): void {
        const decoration = {
            range: this.toRange(frame),
            options: ActiveLineDecoration
        };
        this.setDecorations(editor, [decoration]);
    }

    private toRange(frame: DebugProtocol.StackFrame): Range {
        const start = Position.create(
            frame.line - 1,
            frame.endColumn ? frame.column - 1 : 0);
        const end = Position.create(
            frame.endLine ? frame.endLine - 1 : frame.line - 1,
            frame.endColumn ? frame.endColumn - 1 : 0);
        return Range.create(start, end);
    }
}

const InactiveBreakpointDecoration = <EditorDecorationOptions>{
    isWholeLine: false,
    glyphMarginClassName: 'theia-debug-inactive-breakpoint',
};

/**
 * Per session [breakpoint decorator](#BreakpointDecorator) provider.
 */
@injectable()
export class BreakpointDecoratorProvider {
    private readonly defaultDecorator: BreakpointDecorator;
    private readonly decorators = new Map<string, BreakpointDecorator>();

    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(BreakpointStorage) protected readonly breakpointStorage: BreakpointStorage) {
        this.defaultDecorator = new BreakpointDecorator(this.breakpointStorage, this.editorManager);
    }

    @postConstruct()
    protected init() {
        this.debugSessionManager.onDidPreCreateDebugSession(sessionId => this.onDebugSessionPreCreated(sessionId));
        this.debugSessionManager.onDidDestroyDebugSession(debugSession => this.onDebugSessionDestroyed(debugSession));
    }

    get(sessionId: string | undefined): BreakpointDecorator {
        if (!sessionId) {
            return this.defaultDecorator;
        }

        const decorator = this.decorators.get(sessionId);
        if (!decorator) {
            throw new Error(`Decorator is not initialized for the debug session: '${sessionId}'`);
        }

        return decorator;
    }

    private onDebugSessionPreCreated(sessionId: string) {
        const decorator = new BreakpointDecorator(this.breakpointStorage, this.editorManager, sessionId);
        this.decorators.set(sessionId, decorator);
    }

    private onDebugSessionDestroyed(debugSession: DebugSession) {
        const decorator = this.decorators.get(debugSession.sessionId);
        if (decorator) {
            decorator.clearDecorations();
            this.decorators.delete(debugSession.sessionId);
        }
    }
}

/**
 * Shows breakpoints.
 */
export class BreakpointDecorator extends EditorDecorator {
    constructor(
        protected readonly breakpointStorage: BreakpointStorage,
        protected readonly editorManager: EditorManager,
        protected readonly sessionId?: string) {
        super();
    }

    showDecorations(editor?: TextEditor): void {
        const editors = editor ? [editor] : this.editorManager.all.map(widget => widget.editor);

        editors.forEach(e => {
            this.breakpointStorage.get(DebugUtils.isSourceBreakpoint)
                .then(breakpoints => breakpoints.filter(b => DebugUtils.checkUri(b, e.uri)))
                .then(breakpoints => breakpoints.map(b => ({
                    range: this.toRange(b.origin as DebugProtocol.SourceBreakpoint),
                    options: InactiveBreakpointDecoration
                })))
                .then(decorations => this.setDecorations(e, decorations));
        });
    }

    clearDecorations(editor?: TextEditor) {
        if (editor) {
            this.setDecorations(editor, []);
        } else {
            this.editorManager.all.forEach(widget => this.setDecorations(widget.editor, []));
        }
    }

    private toRange(breakpoint: DebugProtocol.SourceBreakpoint): Range {
        return Range.create(Position.create(breakpoint.line, 0), Position.create(breakpoint.line, 0));
    }
}
