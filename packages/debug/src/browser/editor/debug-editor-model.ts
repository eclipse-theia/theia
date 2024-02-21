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

import debounce = require('p-debounce');
import { injectable, inject, postConstruct, interfaces, Container } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { IConfigurationService } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configuration';
import { StandaloneCodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneCodeEditor';
import { IDecorationOptions } from '@theia/monaco-editor-core/esm/vs/editor/common/editorCommon';
import { IEditorHoverOptions } from '@theia/monaco-editor-core/esm/vs/editor/common/config/editorOptions';
import URI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection, MenuPath, isOSX } from '@theia/core';
import { ContextMenuRenderer } from '@theia/core/lib/browser';
import { BreakpointManager, SourceBreakpointsChangeEvent } from '../breakpoint/breakpoint-manager';
import { DebugSourceBreakpoint } from '../model/debug-source-breakpoint';
import { DebugSessionManager } from '../debug-session-manager';
import { SourceBreakpoint } from '../breakpoint/breakpoint-marker';
import { DebugEditor } from './debug-editor';
import { DebugHoverWidget, createDebugHoverWidgetContainer } from './debug-hover-widget';
import { DebugBreakpointWidget } from './debug-breakpoint-widget';
import { DebugExceptionWidget } from './debug-exception-widget';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugInlineValueDecorator, INLINE_VALUE_DECORATION_KEY } from './debug-inline-value-decorator';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';

export const DebugEditorModelFactory = Symbol('DebugEditorModelFactory');
export type DebugEditorModelFactory = (editor: DebugEditor) => DebugEditorModel;

@injectable()
export class DebugEditorModel implements Disposable {

    static createContainer(parent: interfaces.Container, editor: DebugEditor): Container {
        const child = createDebugHoverWidgetContainer(parent, editor);
        child.bind(DebugEditorModel).toSelf();
        child.bind(DebugBreakpointWidget).toSelf();
        child.bind(DebugExceptionWidget).toSelf();
        return child;
    }
    static createModel(parent: interfaces.Container, editor: DebugEditor): DebugEditorModel {
        return DebugEditorModel.createContainer(parent, editor).get(DebugEditorModel);
    }

    static CONTEXT_MENU: MenuPath = ['debug-editor-context-menu'];

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnUpdate = new DisposableCollection();

    protected uri: URI;

    protected breakpointDecorations: string[] = [];
    protected breakpointRanges = new Map<string, [monaco.Range, SourceBreakpoint]>();

    protected currentBreakpointDecorations: string[] = [];

    protected editorDecorations: string[] = [];
    protected topFrameRange: monaco.Range | undefined;

    protected updatingDecorations = false;

    @inject(DebugHoverWidget)
    readonly hover: DebugHoverWidget;

    @inject(DebugEditor)
    readonly editor: DebugEditor;

    @inject(BreakpointManager)
    readonly breakpoints: BreakpointManager;

    @inject(DebugSessionManager)
    readonly sessions: DebugSessionManager;

    @inject(ContextMenuRenderer)
    readonly contextMenu: ContextMenuRenderer;

    @inject(DebugBreakpointWidget)
    readonly breakpointWidget: DebugBreakpointWidget;

    @inject(DebugExceptionWidget)
    readonly exceptionWidget: DebugExceptionWidget;

    @inject(DebugInlineValueDecorator)
    readonly inlineValueDecorator: DebugInlineValueDecorator;

    @inject(DebugSessionManager)
    protected readonly sessionManager: DebugSessionManager;

    @postConstruct()
    protected init(): void {
        this.uri = new URI(this.editor.getControl().getModel()!.uri.toString());
        this.toDispose.pushAll([
            this.hover,
            this.breakpointWidget,
            this.exceptionWidget,
            this.editor.getControl().onMouseDown(event => this.handleMouseDown(event)),
            this.editor.getControl().onMouseMove(event => this.handleMouseMove(event)),
            this.editor.getControl().onMouseLeave(event => this.handleMouseLeave(event)),
            this.editor.getControl().onKeyDown(() => this.hover.hide({ immediate: false })),
            this.editor.getControl().onDidChangeModelContent(() => this.update()),
            this.editor.getControl().getModel()!.onDidChangeDecorations(() => this.updateBreakpoints()),
            this.editor.onDidResize(e => this.breakpointWidget.inputSize = e),
            this.sessions.onDidChange(() => this.update()),
            this.toDisposeOnUpdate,
            this.sessionManager.onDidChangeBreakpoints(({ session, uri }) => {
                if ((!session || session === this.sessionManager.currentSession) && uri.isEqual(this.uri)) {
                    this.render();
                }
            }),
            this.breakpoints.onDidChangeBreakpoints(event => this.closeBreakpointIfAffected(event)),
        ]);
        this.update();
        this.render();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected readonly update = debounce(async () => {
        if (this.toDispose.disposed) {
            return;
        }
        this.toDisposeOnUpdate.dispose();
        this.toggleExceptionWidget();
        await this.updateEditorDecorations();
        this.updateEditorHover();
    }, 100);

    /**
     * To disable the default editor-contribution hover from Code when
     * the editor has the `currentFrame`. Otherwise, both `textdocument/hover`
     * and the debug hovers are visible at the same time when hovering over a symbol.
     */
    protected async updateEditorHover(): Promise<void> {
        if (this.sessions.isCurrentEditorFrame(this.uri)) {
            const codeEditor = this.editor.getControl();
            codeEditor.updateOptions({ hover: { enabled: false } });
            this.toDisposeOnUpdate.push(Disposable.create(() => {
                const model = codeEditor.getModel()!;
                const overrides = {
                    resource: model.uri,
                    overrideIdentifier: model.getLanguageId(),
                };
                const { enabled, delay, sticky } = StandaloneServices.get(IConfigurationService).getValue<IEditorHoverOptions>('editor.hover', overrides);
                codeEditor.updateOptions({
                    hover: {
                        enabled,
                        delay,
                        sticky
                    }
                });
            }));
        }
    }

    protected async updateEditorDecorations(): Promise<void> {
        const [newFrameDecorations, inlineValueDecorations] = await Promise.all([
            this.createFrameDecorations(),
            this.createInlineValueDecorations()
        ]);
        const codeEditor = this.editor.getControl() as unknown as StandaloneCodeEditor;
        codeEditor.removeDecorations([INLINE_VALUE_DECORATION_KEY]);
        codeEditor.setDecorationsByType('Inline debug decorations', INLINE_VALUE_DECORATION_KEY, inlineValueDecorations);
        this.editorDecorations = this.deltaDecorations(this.editorDecorations, newFrameDecorations);
    }

    protected async createInlineValueDecorations(): Promise<IDecorationOptions[]> {
        if (!this.sessions.isCurrentEditorFrame(this.uri)) {
            return [];
        }
        const { currentFrame } = this.sessions;
        return this.inlineValueDecorator.calculateDecorations(this, currentFrame);
    }

    protected createFrameDecorations(): monaco.editor.IModelDeltaDecoration[] {
        const { currentFrame, topFrame } = this.sessions;
        if (!currentFrame) {
            return [];
        }

        if (!currentFrame.thread.stopped) {
            return [];
        }

        if (!this.sessions.isCurrentEditorFrame(this.uri)) {
            return [];
        }

        const decorations: monaco.editor.IModelDeltaDecoration[] = [];
        const columnUntilEOLRange = new monaco.Range(currentFrame.raw.line, currentFrame.raw.column, currentFrame.raw.line, 1 << 30);
        const range = new monaco.Range(currentFrame.raw.line, currentFrame.raw.column, currentFrame.raw.line, currentFrame.raw.column + 1);

        if (topFrame === currentFrame) {
            decorations.push({
                options: DebugEditorModel.TOP_STACK_FRAME_MARGIN,
                range
            });
            decorations.push({
                options: DebugEditorModel.TOP_STACK_FRAME_DECORATION,
                range: columnUntilEOLRange
            });
            const { topFrameRange } = this;
            if (topFrameRange && topFrameRange.startLineNumber === currentFrame.raw.line && topFrameRange.startColumn !== currentFrame.raw.column) {
                decorations.push({
                    options: DebugEditorModel.TOP_STACK_FRAME_INLINE_DECORATION,
                    range: columnUntilEOLRange
                });
            }
            this.topFrameRange = columnUntilEOLRange;
        } else {
            decorations.push({
                options: DebugEditorModel.FOCUSED_STACK_FRAME_MARGIN,
                range
            });
            decorations.push({
                options: DebugEditorModel.FOCUSED_STACK_FRAME_DECORATION,
                range: columnUntilEOLRange
            });
        }
        return decorations;
    }

    protected async toggleExceptionWidget(): Promise<void> {
        const { currentFrame } = this.sessions;
        if (!currentFrame) {
            return;
        }
        if (!this.sessions.isCurrentEditorFrame(this.uri)) {
            this.exceptionWidget.hide();
            return;
        }
        const info = await currentFrame.thread.getExceptionInfo();
        if (!info) {
            this.exceptionWidget.hide();
            return;
        }
        this.exceptionWidget.show({
            info,
            lineNumber: currentFrame.raw.line,
            column: currentFrame.raw.column
        });
    }

    render(): void {
        this.renderBreakpoints();
        this.renderCurrentBreakpoints();
    }
    protected renderBreakpoints(): void {
        const breakpoints = this.breakpoints.getBreakpoints(this.uri);
        const decorations = this.createBreakpointDecorations(breakpoints);
        this.breakpointDecorations = this.deltaDecorations(this.breakpointDecorations, decorations);
        this.updateBreakpointRanges(breakpoints);
    }
    protected createBreakpointDecorations(breakpoints: SourceBreakpoint[]): monaco.editor.IModelDeltaDecoration[] {
        return breakpoints.map(breakpoint => this.createBreakpointDecoration(breakpoint));
    }
    protected createBreakpointDecoration(breakpoint: SourceBreakpoint): monaco.editor.IModelDeltaDecoration {
        const lineNumber = breakpoint.raw.line;
        const column = breakpoint.raw.column;
        const range = typeof column === 'number' ? new monaco.Range(lineNumber, column, lineNumber, column + 1) : new monaco.Range(lineNumber, 1, lineNumber, 2);
        return {
            range,
            options: {
                stickiness: DebugEditorModel.STICKINESS
            }
        };
    }

    protected updateBreakpointRanges(breakpoints: SourceBreakpoint[]): void {
        this.breakpointRanges.clear();
        for (let i = 0; i < this.breakpointDecorations.length; i++) {
            const decoration = this.breakpointDecorations[i];
            const breakpoint = breakpoints[i];
            const range = this.editor.getControl().getModel()!.getDecorationRange(decoration)!;
            this.breakpointRanges.set(decoration, [range, breakpoint]);
        }
    }

    protected renderCurrentBreakpoints(): void {
        const decorations = this.createCurrentBreakpointDecorations();
        this.currentBreakpointDecorations = this.deltaDecorations(this.currentBreakpointDecorations, decorations);
    }
    protected createCurrentBreakpointDecorations(): monaco.editor.IModelDeltaDecoration[] {
        const breakpoints = this.sessions.getBreakpoints(this.uri);
        return breakpoints.map(breakpoint => this.createCurrentBreakpointDecoration(breakpoint));
    }
    protected createCurrentBreakpointDecoration(breakpoint: DebugSourceBreakpoint): monaco.editor.IModelDeltaDecoration {
        const lineNumber = breakpoint.line;
        const column = breakpoint.column;
        const range = typeof column === 'number' ? new monaco.Range(lineNumber, column, lineNumber, column + 1) : new monaco.Range(lineNumber, 1, lineNumber, 1);
        const { className, message } = breakpoint.getDecoration();
        const renderInline = typeof column === 'number' && (column > this.editor.getControl().getModel()!.getLineFirstNonWhitespaceColumn(lineNumber));
        return {
            range,
            options: {
                glyphMarginClassName: className,
                glyphMarginHoverMessage: message.map(value => ({ value })),
                stickiness: DebugEditorModel.STICKINESS,
                beforeContentClassName: renderInline ? `theia-debug-breakpoint-column codicon ${className}` : undefined
            }
        };
    }

    protected updateBreakpoints(): void {
        if (this.areBreakpointsAffected()) {
            const breakpoints = this.createBreakpoints();
            this.breakpoints.setBreakpoints(this.uri, breakpoints);
        }
    }
    protected areBreakpointsAffected(): boolean {
        if (this.updatingDecorations || !this.editor.getControl().getModel()) {
            return false;
        }
        for (const decoration of this.breakpointDecorations) {
            const range = this.editor.getControl().getModel()!.getDecorationRange(decoration);
            const oldRange = this.breakpointRanges.get(decoration)![0];
            if (!range || !range.equalsRange(oldRange)) {
                return true;
            }
        }
        return false;
    }
    protected createBreakpoints(): SourceBreakpoint[] {
        const { uri } = this;
        const lines = new Set<number>();
        const breakpoints: SourceBreakpoint[] = [];
        for (const decoration of this.breakpointDecorations) {
            const range = this.editor.getControl().getModel()!.getDecorationRange(decoration);
            if (range && !lines.has(range.startLineNumber)) {
                const line = range.startLineNumber;
                const column = range.startColumn;
                const oldBreakpoint = this.breakpointRanges.get(decoration)?.[1];
                const isLineBreakpoint = oldBreakpoint?.raw.line !== undefined && oldBreakpoint?.raw.column === undefined;
                const change = isLineBreakpoint ? { line } : { line, column };
                const breakpoint = SourceBreakpoint.create(uri, change, oldBreakpoint);
                breakpoints.push(breakpoint);
                lines.add(line);
            }
        }
        return breakpoints;
    }

    get position(): monaco.Position {
        return this.editor.getControl().getPosition()!;
    }
    getBreakpoint(position: monaco.Position = this.position): DebugSourceBreakpoint | undefined {
        return this.getInlineBreakpoint(position) || this.getLineBreakpoints(position)[0];
    }

    getInlineBreakpoint(position: monaco.Position = this.position): DebugSourceBreakpoint | undefined {
        return this.sessions.getInlineBreakpoint(this.uri, position.lineNumber, position.column);
    }

    protected getLineBreakpoints(position: monaco.Position = this.position): DebugSourceBreakpoint[] {
        return this.sessions.getLineBreakpoints(this.uri, position.lineNumber);
    }

    protected addBreakpoint(raw: DebugProtocol.SourceBreakpoint): void {
        this.breakpoints.addBreakpoint(SourceBreakpoint.create(this.uri, raw));
    }

    toggleBreakpoint(position: monaco.Position = this.position): void {
        const { lineNumber } = position;
        const breakpoints = this.getLineBreakpoints(position);
        if (breakpoints.length) {
            for (const breakpoint of breakpoints) {
                breakpoint.remove();
            }
        } else {
            this.addBreakpoint({ line: lineNumber });
        }
    }

    addInlineBreakpoint(): void {
        const { position } = this;
        const { lineNumber, column } = position;
        const breakpoint = this.getInlineBreakpoint(position);
        if (breakpoint) {
            return;
        }
        this.addBreakpoint({ line: lineNumber, column });
    }

    acceptBreakpoint(): void {
        const { position, values } = this.breakpointWidget;
        if (position && values) {
            const breakpoint = position.column > 0 ? this.getInlineBreakpoint(position) : this.getLineBreakpoints(position)[0];
            if (breakpoint) {
                breakpoint.updateOrigins(values);
            } else {
                const { lineNumber } = position;
                const column = position.column > 0 ? position.column : undefined;
                this.addBreakpoint({ line: lineNumber, column, ...values });
            }
            this.breakpointWidget.hide();
        }
    }

    protected handleMouseDown(event: monaco.editor.IEditorMouseEvent): void {
        if (event.target && event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            if (!event.event.rightButton) {
                this.toggleBreakpoint(event.target.position!);
            }
        }
        this.hintBreakpoint(event);
    }
    protected handleMouseMove(event: monaco.editor.IEditorMouseEvent): void {
        this.showHover(event);
        this.hintBreakpoint(event);
    }
    protected handleMouseLeave(event: monaco.editor.IPartialEditorMouseEvent): void {
        this.hideHover(event);
        this.deltaHintDecorations([]);
    }

    protected hintDecorations: string[] = [];
    protected hintBreakpoint(event: monaco.editor.IEditorMouseEvent): void {
        const hintDecorations = this.createHintDecorations(event);
        this.deltaHintDecorations(hintDecorations);
    }
    protected deltaHintDecorations(hintDecorations: monaco.editor.IModelDeltaDecoration[]): void {
        this.hintDecorations = this.deltaDecorations(this.hintDecorations, hintDecorations);
    }
    protected createHintDecorations(event: monaco.editor.IEditorMouseEvent): monaco.editor.IModelDeltaDecoration[] {
        if (event.target && event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && event.target.position) {
            const lineNumber = event.target.position.lineNumber;
            if (this.getLineBreakpoints(event.target.position).length) {
                return [];
            }
            return [{
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                options: DebugEditorModel.BREAKPOINT_HINT_DECORATION
            }];
        }
        return [];
    }

    protected closeBreakpointIfAffected({ uri, removed }: SourceBreakpointsChangeEvent): void {
        if (!uri.isEqual(this.uri)) {
            return;
        }
        const position = this.breakpointWidget.position;
        if (!position) {
            return;
        }
        for (const breakpoint of removed) {
            if (breakpoint.raw.line === position.lineNumber) {
                this.breakpointWidget.hide();
                break;
            }
        }
    }

    protected showHover(mouseEvent: monaco.editor.IEditorMouseEvent): void {
        const targetType = mouseEvent.target.type;
        const stopKey = isOSX ? 'metaKey' : 'ctrlKey';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (targetType === monaco.editor.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === this.hover.getId() && !(<any>mouseEvent.event)[stopKey]) {
            // mouse moved on top of debug hover widget
            return;
        }
        if (targetType === monaco.editor.MouseTargetType.CONTENT_TEXT) {
            this.hover.show({
                selection: mouseEvent.target.range!,
                immediate: false
            });
        } else {
            this.hover.hide({ immediate: false });
        }
    }
    protected hideHover({ event }: monaco.editor.IPartialEditorMouseEvent): void {
        const rect = this.hover.getDomNode().getBoundingClientRect();
        if (event.posx < rect.left || event.posx > rect.right || event.posy < rect.top || event.posy > rect.bottom) {
            this.hover.hide({ immediate: false });
        }
    }

    protected deltaDecorations(oldDecorations: string[], newDecorations: monaco.editor.IModelDeltaDecoration[]): string[] {
        this.updatingDecorations = true;
        try {
            return this.editor.getControl().deltaDecorations(oldDecorations, newDecorations);
        } finally {
            this.updatingDecorations = false;
        }
    }

    static STICKINESS = monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

    static BREAKPOINT_HINT_DECORATION: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'codicon-debug-hint',
        stickiness: DebugEditorModel.STICKINESS
    };

    static TOP_STACK_FRAME_MARGIN: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'codicon-debug-stackframe',
        stickiness: DebugEditorModel.STICKINESS
    };
    static FOCUSED_STACK_FRAME_MARGIN: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'codicon-debug-stackframe-focused',
        stickiness: DebugEditorModel.STICKINESS
    };
    static TOP_STACK_FRAME_DECORATION: monaco.editor.IModelDecorationOptions = {
        isWholeLine: true,
        className: 'theia-debug-top-stack-frame-line',
        stickiness: DebugEditorModel.STICKINESS
    };
    static TOP_STACK_FRAME_INLINE_DECORATION: monaco.editor.IModelDecorationOptions = {
        beforeContentClassName: 'theia-debug-top-stack-frame-column'
    };
    static FOCUSED_STACK_FRAME_DECORATION: monaco.editor.IModelDecorationOptions = {
        isWholeLine: true,
        className: 'theia-debug-focused-stack-frame-line',
        stickiness: DebugEditorModel.STICKINESS
    };

}
