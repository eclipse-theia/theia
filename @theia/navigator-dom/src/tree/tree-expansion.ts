import {injectable, inject} from "inversify";
import {Emitter, Event, Disposable} from "@theia/platform-common";
import {ICompositeTreeNode, ITreeNode, ITree} from "./tree";

export const ITreeExpansionService = Symbol("ITreeExpansionService");

/**
 * The tree expandable service.
 */
export interface ITreeExpansionService extends Disposable {
    /**
     * Emit when the node is expanded or collapsed.
     */
    readonly onExpansionChanged: Event<Readonly<IExpandableTreeNode>>;
    /**
     * If the given node is valid and collapsed then expand it.
     * Expanding a node refreshes all its children.
     */
    expandNode(node: Readonly<IExpandableTreeNode>): void;
    /**
     * If the given node is valid and expanded then collapse it.
     */
    collapseNode(node: Readonly<IExpandableTreeNode>): void;
    /**
     * If the given node is invalid then does nothing.
     * If the given node is collapsed then expand it; otherwise collapse it.
     */
    toggleNodeExpansion(node: Readonly<IExpandableTreeNode>): void;
}

/**
 * The expandable tree node.
 */
export interface IExpandableTreeNode extends ICompositeTreeNode {
    /**
     * Test whether this tree node is expanded.
     */
    expanded: boolean;
}

export namespace IExpandableTreeNode {
    export function is(node: ITreeNode | undefined): node is IExpandableTreeNode {
        return !!node && ICompositeTreeNode.is(node) && 'expanded' in node;
    }

    export function isExpanded(node: ITreeNode | undefined): node is IExpandableTreeNode {
        return IExpandableTreeNode.is(node) && node.expanded;
    }

    export function isCollapsed(node: ITreeNode | undefined): node is IExpandableTreeNode {
        return IExpandableTreeNode.is(node) && !node.expanded;
    }
}

@injectable()
export class TreeExpansionService implements ITreeExpansionService {

    protected readonly onExpansionChangedEmitter = new Emitter<IExpandableTreeNode>();

    constructor(@inject(ITree) protected readonly state: ITree) {
        state.onNodeRefreshed(node => {
            for (const child of node.children) {
                if (IExpandableTreeNode.isExpanded(child)) {
                    this.state.refresh(child);
                }
            }
        });
    }

    dispose() {
        this.onExpansionChangedEmitter.dispose();
    }

    get onExpansionChanged(): Event<IExpandableTreeNode> {
        return this.onExpansionChangedEmitter.event;
    }

    protected fireExpansionChanged(node: IExpandableTreeNode): void {
        this.onExpansionChangedEmitter.fire(node);
    }

    expandNode(raw: IExpandableTreeNode): void {
        const node = this.state.validateNode(raw);
        if (IExpandableTreeNode.isCollapsed(node)) {
            this.doExpandNode(node);
        }
    }

    protected doExpandNode(node: IExpandableTreeNode): void {
        node.expanded = true;
        this.fireExpansionChanged(node);
        this.state.refresh(node);
    }

    collapseNode(raw: IExpandableTreeNode): void {
        const node = this.state.validateNode(raw);
        if (IExpandableTreeNode.isExpanded(node)) {
            this.doCollapseNode(node);
        }
    }

    protected doCollapseNode(node: IExpandableTreeNode): void {
        node.expanded = false;
        this.fireExpansionChanged(node);
    }

    toggleNodeExpansion(node: IExpandableTreeNode): void {
        if (node.expanded) {
            this.collapseNode(node);
        } else {
            this.expandNode(node);
        }
    }

}
