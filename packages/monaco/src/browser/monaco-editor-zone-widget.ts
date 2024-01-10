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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableCollection, Event, Emitter } from '@theia/core';
import { TrackedRangeStickiness } from '@theia/editor/lib/browser';
import * as monaco from '@theia/monaco-editor-core';

export interface MonacoEditorViewZone extends monaco.editor.IViewZone {
    id: string;
}

export class MonacoEditorZoneWidget implements Disposable {

    private arrow: Arrow | undefined;

    readonly zoneNode = document.createElement('div');
    readonly containerNode = document.createElement('div');

    protected readonly onDidLayoutChangeEmitter = new Emitter<monaco.editor.IDimension>();
    readonly onDidLayoutChange: Event<monaco.editor.IDimension> = this.onDidLayoutChangeEmitter.event;

    protected viewZone: MonacoEditorViewZone | undefined;

    protected readonly toHide = new DisposableCollection();

    protected readonly toDispose = new DisposableCollection(
        this.onDidLayoutChangeEmitter,
        this.toHide
    );

    editor: monaco.editor.IStandaloneCodeEditor;

    constructor(
        editorInstance: monaco.editor.IStandaloneCodeEditor, readonly showArrow: boolean = true
    ) {
        this.editor = editorInstance;
        this.zoneNode.classList.add('zone-widget');
        this.containerNode.classList.add('zone-widget-container');
        this.zoneNode.appendChild(this.containerNode);
        this.updateWidth();
        this.toDispose.push(this.editor.onDidLayoutChange(info => this.updateWidth(info)));
    }

    dispose(): void {
        this.toDispose.dispose();
        this.hide();
    }

    protected _options: MonacoEditorZoneWidget.Options | undefined;
    get options(): MonacoEditorZoneWidget.Options | undefined {
        return this.viewZone ? this._options : undefined;
    }

    hide(): void {
        this.toHide.dispose();
    }

    show(options: MonacoEditorZoneWidget.Options): void {
        let { afterLineNumber, afterColumn, heightInLines } = this._options = { showFrame: true, ...options };
        const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        // adjust heightInLines to viewport
        const maxHeightInLines = Math.max(12, (this.editor.getLayoutInfo().height / lineHeight) * 0.8);
        heightInLines = Math.min(heightInLines, maxHeightInLines);
        let arrowHeight = 0;
        this.toHide.dispose();
        this.editor.changeViewZones(accessor => {
            this.zoneNode.style.top = '-1000px';
            const domNode = document.createElement('div');
            domNode.style.overflow = 'hidden';
            const zone: monaco.editor.IViewZone = {
                domNode,
                afterLineNumber,
                afterColumn,
                heightInLines,
                onDomNodeTop: zoneTop => this.updateTop(zoneTop),
                onComputedHeight: zoneHeight => this.updateHeight(zoneHeight)
            };
            this.viewZone = Object.assign(zone, {
                id: accessor.addZone(zone)
            });
            const id = this.viewZone.id;
            this.toHide.push(Disposable.create(() => {
                this.editor.changeViewZones(a => a.removeZone(id));
                this.viewZone = undefined;
            }));
            if (this.showArrow) {
                this.arrow = new Arrow(this.editor);
                arrowHeight = Math.round(lineHeight / 3);
                this.arrow.height = arrowHeight;
                this.arrow.show({ lineNumber: options.afterLineNumber, column: 0 });

                this.toHide.push(this.arrow);
            }
            const widget: monaco.editor.IOverlayWidget = {
                getId: () => 'editor-zone-widget-' + id,
                getDomNode: () => this.zoneNode,
                // eslint-disable-next-line no-null/no-null
                getPosition: () => null!
            };
            this.editor.addOverlayWidget(widget);
            this.toHide.push(Disposable.create(() => this.editor.removeOverlayWidget(widget)));
        });

        this.containerNode.style.overflow = 'hidden';
        this.updateContainerHeight(heightInLines * lineHeight);

        const model = this.editor.getModel();
        if (model) {
            const revealLineNumber = Math.min(model.getLineCount(), Math.max(1, afterLineNumber + 1));
            this.editor.revealLine(revealLineNumber, monaco.editor.ScrollType.Smooth);
        }
    }

    layout(heightInLines: number): void {
        if (this.viewZone && this.viewZone.heightInLines !== heightInLines) {
            this.viewZone.heightInLines = heightInLines;
            const id = this.viewZone.id;
            this.editor.changeViewZones(accessor => accessor.layoutZone(id));
        }
    }

    protected updateTop(top: number): void {
        this.zoneNode.style.top = top + (this.showArrow ? 6 : 0) + 'px';
    }
    protected updateHeight(zoneHeight: number): void {
        this.zoneNode.style.height = zoneHeight + 'px';
        this.updateContainerHeight(zoneHeight);
    }
    protected updateContainerHeight(zoneHeight: number): void {
        const { frameWidth, height } = this.computeContainerHeight(zoneHeight);
        this.containerNode.style.height = height + 'px';
        this.containerNode.style.borderTopWidth = frameWidth + 'px';
        this.containerNode.style.borderBottomWidth = frameWidth + 'px';
        const width = this.computeWidth();
        this.onDidLayoutChangeEmitter.fire({ height, width });
    }
    protected computeContainerHeight(zoneHeight: number): {
        height: number,
        frameWidth: number
    } {
        const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        const frameWidth = this._options && this._options.frameWidth;
        const frameThickness = this._options && this._options.showFrame ? Math.round(lineHeight / 9) : 0;
        return {
            frameWidth: frameWidth !== undefined ? frameWidth : frameThickness,
            height: zoneHeight - 2 * frameThickness
        };
    }

    protected updateWidth(info: monaco.editor.EditorLayoutInfo = this.editor.getLayoutInfo()): void {
        const width = this.computeWidth(info);
        this.zoneNode.style.width = width + 'px';
        this.zoneNode.style.left = this.computeLeft(info) + 'px';
    }
    protected computeWidth(info: monaco.editor.EditorLayoutInfo = this.editor.getLayoutInfo()): number {
        return info.width - info.minimap.minimapWidth - info.verticalScrollbarWidth;
    }
    protected computeLeft(info: monaco.editor.EditorLayoutInfo = this.editor.getLayoutInfo()): number {
        // If minimap is to the left, we move beyond it
        if (info.minimap.minimapWidth > 0 && info.minimap.minimapLeft === 0) {
            return info.minimap.minimapWidth;
        }
        return 0;
    }

}

class IdGenerator {
    private lastId: number;
    constructor(private prefix: string) {
        this.lastId = 0;
    }

    nextId(): string {
        return this.prefix + (++this.lastId);
    }
}

class Arrow implements Disposable {

    private readonly idGenerator = new IdGenerator('.arrow-decoration-');

    private readonly ruleName = this.idGenerator.nextId();
    private decorations: string[] = [];
    private _height: number = -1;

    constructor(
        private readonly _editor: monaco.editor.ICodeEditor
    ) { }

    dispose(): void {
        this.hide();
    }

    set height(value: number) {
        if (this._height !== value) {
            this._height = value;
            this._updateStyle();
        }
    }

    private _updateStyle(): void {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.media = 'screen';
        document.getElementsByTagName('head')[0].appendChild(style);
        const selector = `.monaco-editor ${this.ruleName}`;
        const cssText = `border-style: solid; border-color: transparent transparent var(--theia-peekView-border); border-width:
            ${this._height}px; bottom: -${this._height}px; margin-left: -${this._height}px; `;
        (<CSSStyleSheet>style.sheet).insertRule(selector + '{' + cssText + '}', 0);
    }

    show(where: monaco.IPosition): void {
        this.decorations = this._editor.deltaDecorations(
            this.decorations,
            [{ range: monaco.Range.fromPositions(where), options: { className: this.ruleName, stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } }]
        );
    }

    hide(): void {
        this._editor.deltaDecorations(this.decorations, []);
    }
}

export namespace MonacoEditorZoneWidget {
    export interface Options {
        afterLineNumber: number,
        afterColumn?: number,
        heightInLines: number,
        showFrame?: boolean,
        frameWidth?: number
    }
}
