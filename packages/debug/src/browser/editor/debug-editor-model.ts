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

import debounce = require('p-debounce');
import { injectable, inject, postConstruct, interfaces, Container } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection, MenuPath, isOSX } from '@theia/core';
import { ContextMenuRenderer } from '@theia/core/lib/browser';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DebugBreakpoint } from '../model/debug-breakpoint';
import { DebugSessionManager } from '../debug-session-manager';
import { SourceBreakpoint } from '../breakpoint/breakpoint-marker';
import { DebugEditor } from './debug-editor';
import { DebugHoverWidget, createDebugHoverWidgetContainer } from './debug-hover-widget';
import { DebugBreakpointWidget } from './debug-breakpoint-widget';

export const DebugEditorModelFactory = Symbol('DebugEditorModelFactory');
export type DebugEditorModelFactory = (editor: DebugEditor) => DebugEditorModel;

@injectable()
export class DebugEditorModel implements Disposable {

    static createContainer(parent: interfaces.Container, editor: DebugEditor): Container {
        const child = createDebugHoverWidgetContainer(parent, editor);
        child.bind(DebugEditorModel).toSelf();
        child.bind(DebugBreakpointWidget).toSelf();
        return child;
    }
    static createModel(parent: interfaces.Container, editor: DebugEditor): DebugEditorModel {
        return DebugEditorModel.createContainer(parent, editor).get(DebugEditorModel);
    }

    static CONTEXT_MENU: MenuPath = ['debug-editor-context-menu'];

    protected readonly toDispose = new DisposableCollection();

    protected uri: URI;

    protected breakpointDecorations: string[] = [];
    protected breakpointRanges = new Map<string, monaco.Range>();

    protected currentBreakpointDecorations: string[] = [];

    protected frameDecorations: string[] = [];
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

    @postConstruct()
    protected init(): void {
        this.uri = new URI(this.editor.getControl().getModel()!.uri.toString());
        this.toDispose.pushAll([
            this.hover,
            this.breakpointWidget,
            this.editor.getControl().onMouseDown(event => this.handleMouseDown(event)),
            this.editor.getControl().onMouseMove(event => this.handleMouseMove(event)),
            this.editor.getControl().onMouseLeave(event => this.handleMouseLeave(event)),
            this.editor.getControl().onKeyDown(() => this.hover.hide({ immediate: false })),
            this.editor.getControl().getModel()!.onDidChangeDecorations(() => this.updateBreakpoints()),
            this.sessions.onDidChange(() => this.renderFrames())
        ]);
        this.renderFrames();
        this.render();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected readonly renderFrames = debounce(() => {
        const decorations = this.createFrameDecorations();
        this.frameDecorations = this.deltaDecorations(this.frameDecorations, decorations);
    }, 100);
    protected createFrameDecorations(): monaco.editor.IModelDeltaDecoration[] {
        const decorations: monaco.editor.IModelDeltaDecoration[] = [];
        const { currentFrame, topFrame } = this.sessions;
        if (!currentFrame || !currentFrame.source || currentFrame.source.uri.toString() !== this.uri.toString()) {
            return decorations;
        }

        const columnUntilEOLRange = new monaco.Range(currentFrame.raw.line, currentFrame.raw.column, currentFrame.raw.line, 1 << 30);
        const range = new monaco.Range(currentFrame.raw.line, currentFrame.raw.column, currentFrame.raw.line, currentFrame.raw.column + 1);

        if (topFrame === currentFrame) {
            decorations.push({
                options: DebugEditorModel.TOP_STACK_FRAME_MARGIN,
                range
            });

            if (currentFrame.thread.stoppedDetails && currentFrame.thread.stoppedDetails.reason === 'exception') {
                decorations.push({
                    options: DebugEditorModel.TOP_STACK_FRAME_EXCEPTION_DECORATION,
                    range: columnUntilEOLRange
                });
            } else {
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
            }
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

    render(): void {
        this.renderBreakpoints();
        this.renderCurrentBreakpoints();
    }
    protected renderBreakpoints(): void {
        const decorations = this.createBreakpointDecorations();
        this.breakpointDecorations = this.deltaDecorations(this.breakpointDecorations, decorations);
        this.updateBreakpointRanges();
    }
    protected createBreakpointDecorations(): monaco.editor.IModelDeltaDecoration[] {
        const breakpoints = this.breakpoints.getBreakpoints(this.uri);
        return breakpoints.map(breakpoint => this.createBreakpointDecoration(breakpoint));
    }
    protected createBreakpointDecoration(breakpoint: SourceBreakpoint): monaco.editor.IModelDeltaDecoration {
        const lineNumber = breakpoint.raw.line;
        const range = new monaco.Range(lineNumber, 1, lineNumber, 2);
        return {
            range,
            options: {
                stickiness: DebugEditorModel.STICKINESS
            }
        };
    }
    protected updateBreakpointRanges(): void {
        this.breakpointRanges.clear();
        for (const decoration of this.breakpointDecorations) {
            const range = this.editor.getControl().getModel()!.getDecorationRange(decoration)!;
            this.breakpointRanges.set(decoration, range);
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
    protected createCurrentBreakpointDecoration(breakpoint: DebugBreakpoint): monaco.editor.IModelDeltaDecoration {
        const lineNumber = breakpoint.line;
        const range = new monaco.Range(lineNumber, 1, lineNumber, 1);
        const { className, message } = breakpoint.getDecoration();
        return {
            range,
            options: {
                glyphMarginClassName: className,
                glyphMarginHoverMessage: message.map(value => ({ value })),
                stickiness: DebugEditorModel.STICKINESS
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
            const oldRange = this.breakpointRanges.get(decoration)!;
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
                const oldRange = this.breakpointRanges.get(decoration);
                const oldBreakpoint = oldRange && this.breakpoints.getBreakpoint(uri, oldRange.startLineNumber);
                const breakpoint = SourceBreakpoint.create(uri, { line, column: 1 }, oldBreakpoint);
                breakpoints.push(breakpoint);
                lines.add(line);
            }
        }
        return breakpoints;
    }

    protected _position: monaco.Position | undefined;
    get position(): monaco.Position {
        return this._position || this.editor.getControl().getPosition()!;
    }
    get breakpoint(): DebugBreakpoint | undefined {
        return this.getBreakpoint();
    }
    protected getBreakpoint(position: monaco.Position = this.position): DebugBreakpoint | undefined {
        return this.sessions.getBreakpoint(this.uri, position.lineNumber);
    }
    toggleBreakpoint(): void {
        this.doToggleBreakpoint();
    }
    protected doToggleBreakpoint(position: monaco.Position = this.position): void {
        const breakpoint = this.getBreakpoint(position);
        if (breakpoint) {
            breakpoint.remove();
        } else {
            this.breakpoints.addBreakpoint(SourceBreakpoint.create(this.uri, {
                line: position.lineNumber,
                column: 1
            }));
        }
    }

    acceptBreakpoint(): void {
        const { position, values } = this.breakpointWidget;
        if (position && values) {
            const breakpoint = this.getBreakpoint(position);
            if (breakpoint) {
                breakpoint.updateOrigins(values);
            } else {
                this.breakpoints.addBreakpoint(SourceBreakpoint.create(this.uri, {
                    line: position.lineNumber,
                    column: 1,
                    ...values
                }));
            }
            this.breakpointWidget.hide();
        }
    }

    protected handleMouseDown(event: monaco.editor.IEditorMouseEvent): void {
        if (event.target && event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            if (event.event.rightButton) {
                this._position = event.target.position!;
                this.contextMenu.render(DebugEditorModel.CONTEXT_MENU, event.event.browserEvent, () =>
                    setTimeout(() => this._position = undefined)
                );
            } else {
                this.doToggleBreakpoint(event.target.position!);
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
            if (!!this.sessions.getBreakpoint(this.uri, lineNumber)) {
                return [];
            }
            return [{
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                options: DebugEditorModel.BREAKPOINT_HINT_DECORATION
            }];
        }
        return [];
    }

    protected showHover(mouseEvent: monaco.editor.IEditorMouseEvent): void {
        const targetType = mouseEvent.target.type;
        const stopKey = isOSX ? 'metaKey' : 'ctrlKey';

        // tslint:disable-next-line:no-any
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
            return this.editor.getControl().getModel()!.deltaDecorations(oldDecorations, newDecorations);
        } finally {
            this.updatingDecorations = false;
        }
    }

    static STICKINESS = monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;

    static BREAKPOINT_HINT_DECORATION: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'theia-debug-breakpoint-hint',
        stickiness: DebugEditorModel.STICKINESS
    };

    static TOP_STACK_FRAME_MARGIN: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'theia-debug-top-stack-frame',
        stickiness: DebugEditorModel.STICKINESS
    };
    static FOCUSED_STACK_FRAME_MARGIN: monaco.editor.IModelDecorationOptions = {
        glyphMarginClassName: 'theia-debug-focused-stack-frame',
        stickiness: DebugEditorModel.STICKINESS
    };
    static TOP_STACK_FRAME_DECORATION: monaco.editor.IModelDecorationOptions = {
        isWholeLine: true,
        className: 'theia-debug-top-stack-frame-line',
        stickiness: DebugEditorModel.STICKINESS
    };
    static TOP_STACK_FRAME_EXCEPTION_DECORATION: monaco.editor.IModelDecorationOptions = {
        isWholeLine: true,
        className: 'theia-debug-top-stack-frame-exception-line',
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
