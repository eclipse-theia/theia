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

import { Message } from '@phosphor/messaging';
import { inject, injectable } from 'inversify';
import { Key, LabelProvider, ReactWidget } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { ScmResourceGroup } from './scm-service';

@injectable()
export abstract class ScmNavigableListWidget<T extends { group: ScmResourceGroup, selected?: boolean, sourceUri: URI }> extends ReactWidget {

    protected scmNodes: T[];
    private _scrollContainer: string;

    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    constructor() {
        super();
        this.node.tabIndex = 0;
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.update();
        this.node.focus();
    }

    protected set scrollContainer(id: string) {
        this._scrollContainer = id + Date.now();
    }

    protected get scrollContainer(): string {
        return this._scrollContainer;
    }

    protected addScmListNavigationKeyListeners(container: HTMLElement): void {
        this.addKeyListener(container, Key.ARROW_LEFT, () => this.navigateLeft());
        this.addKeyListener(container, Key.ARROW_RIGHT, () => this.navigateRight());
        this.addKeyListener(container, Key.ARROW_UP, () => this.navigateUp());
        this.addKeyListener(container, Key.ARROW_DOWN, () => this.navigateDown());
        this.addKeyListener(container, Key.ENTER, () => this.handleListEnter());
    }

    protected navigateLeft(): void {
        this.selectPreviousNode();
    }

    protected navigateRight(): void {
        this.selectNextNode();
    }

    protected navigateUp(): void {
        this.selectPreviousNode();
    }

    protected navigateDown(): void {
        this.selectNextNode();
    }

    protected handleListEnter(): void {

    }

    protected getSelected(): T | undefined {
        return this.scmNodes ? this.scmNodes.find(c => c.selected || false) : undefined;
    }

    protected selectNode(node: T): void {
        const n = this.getSelected();
        if (n) {
            n.selected = false;
        }
        if (this.scmNodes) {
            const scmNode = this.scmNodes.find(resource =>
                resource.sourceUri.toString() === node.sourceUri.toString() &&
                ((node.group && resource.group) ? node.group.label === resource.group.label : true));
            if (scmNode) {
                scmNode.selected = true;
            }
        }
        this.update();
    }

    protected selectNextNode(): void {
        const idx = this.indexOfSelected;
        if (idx >= 0 && idx < this.scmNodes.length - 1) {
            this.selectNode(this.scmNodes[idx + 1]);
        } else if (this.scmNodes.length > 0 && idx === -1) {
            this.selectNode(this.scmNodes[0]);
        }
    }

    protected selectPreviousNode(): void {
        const idx = this.indexOfSelected;
        if (idx > 0) {
            this.selectNode(this.scmNodes[idx - 1]);
        }
    }

    protected get indexOfSelected(): number {
        if (this.scmNodes && this.scmNodes.length > 0) {
            return this.scmNodes.findIndex(c => c.selected || false);
        }
        return -1;
    }
}
