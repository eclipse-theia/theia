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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableCollection, Event, Emitter } from '@theia/core';

export interface MonacoEditorViewZone extends monaco.editor.IViewZone {
    id: string;
}

export class MonacoEditorZoneWidget implements Disposable {

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

    constructor(
        readonly editor: monaco.editor.IStandaloneCodeEditor
    ) {
        this.zoneNode.classList.add('zone-widget');
        this.containerNode.classList.add('zone-widget-container');
        this.zoneNode.appendChild(this.containerNode);
        this.updateWidth();
        this.toDispose.push(this.editor.onDidLayoutChange(info => this.updateWidth(info)));
    }

    dispose(): void {
        this.toDispose.dispose();
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
        const maxHeightInLines = (this.editor.getLayoutInfo().height / lineHeight) * .8;
        if (heightInLines >= maxHeightInLines) {
            heightInLines = maxHeightInLines;
        }
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
            const widget: monaco.editor.IOverlayWidget = {
                getId: () => 'editor-zone-widget-' + id,
                getDomNode: () => this.zoneNode,
                // eslint-disable-next-line no-null/no-null
                getPosition: () => null!
            };
            this.editor.addOverlayWidget(widget);
            this.toHide.push(Disposable.create(() => this.editor.removeOverlayWidget(widget)));
        });

        this.containerNode.style.top = 0 + 'px';
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
        this.zoneNode.style.top = top + 'px';
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
        return info.width - info.minimapWidth - info.verticalScrollbarWidth;
    }
    protected computeLeft(info: monaco.editor.EditorLayoutInfo = this.editor.getLayoutInfo()): number {
        // If minimap is to the left, we move beyond it
        if (info.minimapWidth > 0 && info.minimapLeft === 0) {
            return info.minimapWidth;
        }
        return 0;
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
