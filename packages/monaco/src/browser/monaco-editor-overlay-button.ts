// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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

import { Disposable, DisposableCollection, Emitter } from '@theia/core';
import { DISABLED_CLASS, onDomEvent } from '@theia/core/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { MonacoEditor } from './monaco-editor';

export class MonacoEditorOverlayButton implements Disposable {

    private static nextId = 1;

    readonly domNode: HTMLElement;

    protected readonly onClickEmitter = new Emitter<void>();
    readonly onClick = this.onClickEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onClickEmitter);

    constructor(
        editor: MonacoEditor,
        label: string,
        id = 'theia-editor.overlayButtonWidget' + MonacoEditorOverlayButton.nextId++
    ) {
        this.domNode = document.createElement('div');
        this.domNode.classList.add('overlay-button');
        this.domNode.textContent = label;
        this.toDispose.push(onDomEvent(this.domNode, 'click', () => this.onClickEmitter.fire()));

        const overlayWidget: monaco.editor.IOverlayWidget = {
            getId: () => id,
            getDomNode: () => this.domNode,
            getPosition: () => ({
                preference: monaco.editor.OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
            })
        };
        editor.getControl().addOverlayWidget(overlayWidget);
        this.toDispose.push(Disposable.create(() => editor.getControl().removeOverlayWidget(overlayWidget)));
    }

    get enabled(): boolean {
        return !this.domNode.classList.contains(DISABLED_CLASS);
    }

    set enabled(value: boolean) {
        if (value) {
            this.domNode.classList.remove(DISABLED_CLASS);
        } else {
            this.domNode.classList.add(DISABLED_CLASS);
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
