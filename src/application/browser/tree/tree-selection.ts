/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Event, Emitter, Disposable, SelectionProvider } from "../../../application/common";
import { ITree, ITreeNode } from "./tree";

export const ITreeSelectionService = Symbol("ITreeSelectionService");

/**
 * The tree selection service.
 */
export interface ITreeSelectionService extends Disposable, SelectionProvider<Readonly<ISelectableTreeNode> | undefined> {
    /**
     * The node selected in the tree. If defined then valid.
     * Undefined if there is no node selection.
     */
    readonly selectedNode: Readonly<ISelectableTreeNode> | undefined;
    /**
     * Emit when the node selection is changed.
     */
    readonly onSelectionChanged: Event<Readonly<ISelectableTreeNode> | undefined>;
    /**
     * Select a given node.
     * If a given node is undefined or invalid then remove the node selection.
     */
    selectNode(node: Readonly<ISelectableTreeNode> | undefined): void;
}

/**
 * The selectable tree node.
 */
export interface ISelectableTreeNode extends ITreeNode {
    /**
     * Test whether this node is selected.
     */
    selected: boolean;
}

export namespace ISelectableTreeNode {
    export function is(node: ITreeNode | undefined): node is ISelectableTreeNode {
        return !!node && 'selected' in node;
    }

    export function isSelected(node: ITreeNode | undefined): node is ISelectableTreeNode {
        return is(node) && node.selected;
    }

    export function isVisible(node: ITreeNode | undefined): node is ISelectableTreeNode {
        return is(node) && ITreeNode.isVisible(node);
    }

    export function getVisibleParent(node: ITreeNode | undefined): ISelectableTreeNode | undefined {
        if (node) {
            if (isVisible(node.parent)) {
                return node.parent;
            }
            return getVisibleParent(node.parent)
        }
    }
}

@injectable()
export class TreeSelectionService implements ITreeSelectionService {

    protected _selectedNode: ISelectableTreeNode | undefined;
    protected readonly onSelectionChangedEmitter = new Emitter<ISelectableTreeNode | undefined>();

    constructor( @inject(ITree) protected readonly tree: ITree) {
        tree.onChanged(() => this.selectNode(this._selectedNode));
    }

    dispose() {
        this.onSelectionChangedEmitter.dispose();
    }

    get selectedNode(): ISelectableTreeNode | undefined {
        return this._selectedNode;
    }

    get onSelectionChanged(): Event<ISelectableTreeNode | undefined> {
        return this.onSelectionChangedEmitter.event;
    }

    protected fireSelectionChanged(): void {
        this.onSelectionChangedEmitter.fire(this._selectedNode);
    }

    selectNode(raw: ISelectableTreeNode | undefined): void {
        const node = this.tree.validateNode(raw);
        if (ISelectableTreeNode.is(node)) {
            this.doSelectNode(node);
        } else {
            this.doSelectNode(undefined);
        }
    }

    protected doSelectNode(node: ISelectableTreeNode | undefined): void {
        if (this._selectedNode) {
            this._selectedNode.selected = false;
        }
        this._selectedNode = node;
        if (node) {
            node.selected = true;
        }
        this.fireSelectionChanged();
    }

}
