// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { inject, injectable } from 'inversify';
import { Emitter, Event } from '../../common';
import { Tree, TreeNode } from './tree';
import { SelectableTreeNode } from './tree-selection';

export interface TreeFocusService {
    readonly focusedNode: SelectableTreeNode | undefined;
    readonly onDidChangeFocus: Event<SelectableTreeNode | undefined>;
    setFocus(node?: SelectableTreeNode): void;
    hasFocus(node?: TreeNode): boolean;
}
export const TreeFocusService = Symbol('TreeFocusService');

@injectable()
export class TreeFocusServiceImpl implements TreeFocusService {
    protected focusedId: string | undefined;
    protected onDidChangeFocusEmitter = new Emitter<SelectableTreeNode | undefined>();
    get onDidChangeFocus(): Event<SelectableTreeNode | undefined> { return this.onDidChangeFocusEmitter.event; }

    @inject(Tree) protected readonly tree: Tree;

    get focusedNode(): SelectableTreeNode | undefined {
        const candidate = this.tree.getNode(this.focusedId);
        if (SelectableTreeNode.is(candidate)) {
            return candidate;
        }
    }

    setFocus(node?: SelectableTreeNode): void {
        if (node?.id !== this.focusedId) {
            this.focusedId = node?.id;
            this.onDidChangeFocusEmitter.fire(node);
        }
    }

    hasFocus(node?: TreeNode): boolean {
        return !!node && node?.id === this.focusedId;
    }
}
