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

import debounce = require('@theia/core/shared/lodash.debounce');

import { Widget } from '@theia/core/shared/@phosphor/widgets';
import { Message } from '@theia/core/shared/@phosphor/messaging';
import { injectable, postConstruct, inject, Container, interfaces } from '@theia/core/shared/inversify';
import { Key } from '@theia/core/lib/browser';
import { SourceTreeWidget } from '@theia/core/lib/browser/source-tree';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugEditor } from './debug-editor';
import { DebugExpressionProvider } from './debug-expression-provider';
import { DebugHoverSource } from './debug-hover-source';

export interface ShowDebugHoverOptions {
    selection: monaco.Range
    /** default: false */
    focus?: boolean
    /** default: true */
    immediate?: boolean
}

export interface HideDebugHoverOptions {
    /** default: true */
    immediate?: boolean
}

export function createDebugHoverWidgetContainer(parent: interfaces.Container, editor: DebugEditor): Container {
    const child = SourceTreeWidget.createContainer(parent, {
        virtualized: false
    });
    child.bind(DebugEditor).toConstantValue(editor);
    child.bind(DebugHoverSource).toSelf();
    child.unbind(SourceTreeWidget);
    child.bind(DebugExpressionProvider).toSelf();
    child.bind(DebugHoverWidget).toSelf();
    return child;
}

@injectable()
export class DebugHoverWidget extends SourceTreeWidget implements monaco.editor.IContentWidget {

    protected readonly toDispose = new DisposableCollection();

    @inject(DebugEditor)
    protected readonly editor: DebugEditor;

    @inject(DebugSessionManager)
    protected readonly sessions: DebugSessionManager;

    @inject(DebugHoverSource)
    protected readonly hoverSource: DebugHoverSource;

    @inject(DebugExpressionProvider)
    protected readonly expressionProvider: DebugExpressionProvider;

    allowEditorOverflow = true;

    static ID = 'debug.editor.hover';
    getId(): string {
        return DebugHoverWidget.ID;
    }

    protected readonly domNode = document.createElement('div');
    protected readonly titleNode = document.createElement('div');
    protected readonly contentNode = document.createElement('div');
    getDomNode(): HTMLElement {
        return this.domNode;
    }

    @postConstruct()
    protected init(): void {
        super.init();
        this.domNode.className = 'theia-debug-hover';
        this.titleNode.className = 'theia-debug-hover-title';
        this.domNode.appendChild(this.titleNode);
        this.contentNode.className = 'theia-debug-hover-content';
        this.domNode.appendChild(this.contentNode);

        this.editor.getControl().addContentWidget(this);
        this.source = this.hoverSource;
        this.toDispose.pushAll([
            this.hoverSource,
            Disposable.create(() => this.editor.getControl().removeContentWidget(this)),
            Disposable.create(() => this.hide()),
            this.sessions.onDidChange(() => {
                if (!this.isEditorFrame()) {
                    this.hide();
                }
            })
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    show(options?: ShowDebugHoverOptions): void {
        this.schedule(() => this.doShow(options), options && options.immediate);
    }
    hide(options?: HideDebugHoverOptions): void {
        this.schedule(() => this.doHide(), options && options.immediate);
    }
    protected schedule(fn: () => void, immediate: boolean = true): void {
        if (immediate) {
            this.doSchedule.cancel();
            fn();
        } else {
            this.doSchedule(fn);
        }
    }
    protected readonly doSchedule = debounce((fn: () => void) => fn(), 300);

    protected options: ShowDebugHoverOptions | undefined;
    protected doHide(): void {
        if (!this.isVisible) {
            return;
        }
        if (this.domNode.contains(document.activeElement)) {
            this.editor.getControl().focus();
        }
        if (this.isAttached) {
            Widget.detach(this);
        }
        this.hoverSource.reset();
        super.hide();
        this.options = undefined;
        this.editor.getControl().layoutContentWidget(this);
    }
    protected async doShow(options: ShowDebugHoverOptions | undefined = this.options): Promise<void> {
        if (!this.isEditorFrame()) {
            this.hide();
            return;
        }
        if (!options) {
            this.hide();
            return;
        }
        if (this.options && this.options.selection.equalsRange(options.selection)) {
            return;
        }
        if (!this.isAttached) {
            Widget.attach(this, this.contentNode);
        }
        super.show();
        this.options = options;
        const expression = this.expressionProvider.get(this.editor.getControl().getModel()!, options.selection);
        if (!expression) {
            this.hide();
            return;
        }
        const toFocus = new DisposableCollection();
        if (this.options.focus === true) {
            toFocus.push(this.model.onNodeRefreshed(() => {
                toFocus.dispose();
                this.activate();
            }));
        }
        if (!await this.hoverSource.evaluate(expression)) {
            toFocus.dispose();
            this.hide();
            return;
        }
        this.editor.getControl().layoutContentWidget(this);
    }
    protected isEditorFrame(): boolean {
        const { currentFrame } = this.sessions;
        return !!currentFrame && !!currentFrame.source &&
            this.editor.getControl().getModel()!.uri.toString() === currentFrame.source.uri.toString();
    }

    getPosition(): monaco.editor.IContentWidgetPosition {
        if (!this.isVisible) {
            return undefined!;
        }
        const position = this.options && this.options.selection.getStartPosition();
        const word = position && this.editor.getControl().getModel()!.getWordAtPosition(position);
        return position && word ? {
            position: new monaco.Position(position.lineNumber, word.startColumn),
            preference: [
                monaco.editor.ContentWidgetPositionPreference.ABOVE,
                monaco.editor.ContentWidgetPositionPreference.BELOW
            ]
        } : undefined!;
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        const { expression } = this.hoverSource;
        const value = expression && expression.value || '';
        this.titleNode.textContent = value;
        this.titleNode.title = value;
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addKeyListener(this.domNode, Key.ESCAPE, () => this.hide());
    }

}
