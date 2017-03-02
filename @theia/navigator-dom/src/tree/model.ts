import {Event} from "@theia/platform-common";
/**
 * The tree model.
 */
export interface ITreeModel {
    /**
     * The root node.
     * Undefined if the root is missing.
     */
    readonly root: ITreeNode | undefined;

    /**
     * Emit when the tree is changed.
     */
    readonly onChanged: Event<void>;
}

/**
 * The tree node.
 */
export interface ITreeNode {
    /**
     * A human-readable name.
     */
    readonly name: string;
    /**
     * A parent node of this tree node.
     * Undefined if this node is root.
     */
    readonly parent: ICompositeTreeNode | undefined;
}

/**
 * The composite tree node.
 */
export interface ICompositeTreeNode extends ITreeNode {
    /**
     * Child nodes of this tree node.
     */
    readonly children: ReadonlyArray<ITreeNode>;
}

export namespace ICompositeTreeNode {
    export function is(node: ITreeNode | undefined): node is ICompositeTreeNode {
        return !!node && 'children' in node;
    }
}
