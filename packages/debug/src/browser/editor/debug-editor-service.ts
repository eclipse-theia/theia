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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { ContextMenuRenderer } from '@theia/core/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugEditorModel, DebugEditorModelFactory } from './debug-editor-model';
import { BreakpointManager, SourceBreakpointsChangeEvent } from '../breakpoint/breakpoint-manager';
import { DebugSourceBreakpoint } from '../model/debug-source-breakpoint';
import { DebugBreakpointWidget } from './debug-breakpoint-widget';

@injectable()
export class DebugEditorService {

    @inject(EditorManager)
    protected readonly editors: EditorManager;

    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;

    @inject(DebugSessionManager)
    protected readonly sessionManager: DebugSessionManager;

    @inject(ContextMenuRenderer)
    protected readonly contextMenu: ContextMenuRenderer;

    @inject(DebugEditorModelFactory)
    protected readonly factory: DebugEditorModelFactory;

    protected readonly models = new Map<string, DebugEditorModel>();

    @postConstruct()
    protected init(): void {
        this.editors.all.forEach(widget => this.push(widget));
        this.editors.onCreated(widget => this.push(widget));
        this.sessionManager.onDidChangeBreakpoints(({ session, uri }) => {
            if (!session || session === this.sessionManager.currentSession) {
                this.render(uri);
            }
        });
        this.breakpoints.onDidChangeBreakpoints(event => this.closeBreakpointIfAffected(event));
    }

    protected push(widget: EditorWidget): void {
        const { editor } = widget;
        if (!(editor instanceof MonacoEditor)) {
            return;
        }
        const uri = editor.getControl().getModel()!.uri.toString();
        const debugModel = this.factory(editor);
        this.models.set(uri, debugModel);
        editor.getControl().onDidDispose(() => {
            debugModel.dispose();
            this.models.delete(uri);
        });
    }

    protected render(uri: URI): void {
        const model = this.models.get(uri.toString());
        if (model) {
            model.render();
        }
    }

    get model(): DebugEditorModel | undefined {
        const { currentEditor } = this.editors;
        const uri = currentEditor && currentEditor.getResourceUri();
        return uri && this.models.get(uri.toString());
    }

    getLogpoint(position: monaco.Position): DebugSourceBreakpoint | undefined {
        const logpoint = this.anyBreakpoint(position);
        return logpoint && logpoint.logMessage ? logpoint : undefined;
    }
    getLogpointEnabled(position: monaco.Position): boolean | undefined {
        const logpoint = this.getLogpoint(position);
        return logpoint && logpoint.enabled;
    }

    getBreakpoint(position: monaco.Position): DebugSourceBreakpoint | undefined {
        const breakpoint = this.anyBreakpoint(position);
        return breakpoint && breakpoint.logMessage ? undefined : breakpoint;
    }
    getBreakpointEnabled(position: monaco.Position): boolean | undefined {
        const breakpoint = this.getBreakpoint(position);
        return breakpoint && breakpoint.enabled;
    }

    anyBreakpoint(position?: monaco.Position): DebugSourceBreakpoint | undefined {
        return this.model && this.model.getBreakpoint(position);
    }

    getInlineBreakpoint(position?: monaco.Position): DebugSourceBreakpoint | undefined {
        return this.model && this.model.getInlineBreakpoint(position);
    }

    toggleBreakpoint(position?: monaco.Position): void {
        const { model } = this;
        if (model) {
            model.toggleBreakpoint(position);
        }
    }
    setBreakpointEnabled(position: monaco.Position, enabled: boolean): void {
        const breakpoint = this.anyBreakpoint(position);
        if (breakpoint) {
            breakpoint.setEnabled(enabled);
        }
    }

    addInlineBreakpoint(): void {
        const { model } = this;
        if (model) {
            model.addInlineBreakpoint();
        }
    }

    showHover(): void {
        const { model } = this;
        if (model) {
            const selection = model.editor.getControl().getSelection()!;
            model.hover.show({ selection, focus: true });
        }
    }
    canShowHover(): boolean {
        const { model } = this;
        if (model) {
            const selection = model.editor.getControl().getSelection()!;
            return !!model.editor.getControl().getModel()!.getWordAtPosition(selection.getStartPosition());
        }
        return false;
    }

    addBreakpoint(context: DebugBreakpointWidget.Context, position?: monaco.Position): void {
        const { model } = this;
        if (model) {
            position = position || model.position;
            const breakpoint = model.getBreakpoint(position);
            if (breakpoint) {
                model.breakpointWidget.show({ breakpoint, context });
            } else {
                model.breakpointWidget.show({
                    position,
                    context
                });
            }
        }
    }
    async editBreakpoint(breakpointOrPosition?: DebugSourceBreakpoint | monaco.Position): Promise<void> {
        if (breakpointOrPosition instanceof monaco.Position) {
            breakpointOrPosition = this.anyBreakpoint(breakpointOrPosition);
        }

        if (breakpointOrPosition) {
            await breakpointOrPosition.open();
            const model = this.models.get(breakpointOrPosition.uri.toString());
            if (model) {
                model.breakpointWidget.show(breakpointOrPosition);
            }
        }
    }
    closeBreakpoint(): void {
        const { model } = this;
        if (model) {
            model.breakpointWidget.hide();
        }
    }
    acceptBreakpoint(): void {
        const { model } = this;
        if (model) {
            model.acceptBreakpoint();
        }
    }
    protected closeBreakpointIfAffected({ uri, removed }: SourceBreakpointsChangeEvent): void {
        const model = this.models.get(uri.toString());
        if (!model) {
            return;
        }
        const position = model.breakpointWidget.position;
        if (!position) {
            return;
        }
        for (const breakpoint of removed) {
            if (breakpoint.raw.line === position.lineNumber) {
                model.breakpointWidget.hide();
            }
        }
    }

}
