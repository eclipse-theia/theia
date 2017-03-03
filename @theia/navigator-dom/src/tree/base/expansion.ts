import {ITreeExpansionService, IExpandableTreeNode, ITreeModel} from "../model";
import {Emitter, Event} from "@theia/platform-common";

/**
 * Created by kosyakov on 02.03.17.
 */
export class BaseTreeExpansionService implements ITreeExpansionService {

    protected readonly onExpansionChangedEmitter = new Emitter<IExpandableTreeNode>();

    constructor(protected readonly model: ITreeModel) {
        model.onNodeRefreshed(node => {
            for (const child of node.children) {
                if (IExpandableTreeNode.is(child) && child.expanded) {
                    this.model.refresh(child);
                }
            }
        });
    }

    get onExpansionChanged(): Event<IExpandableTreeNode> {
        return this.onExpansionChangedEmitter.event;
    }

    protected fireExpansionChanged(node: IExpandableTreeNode): void {
        this.onExpansionChangedEmitter.fire(node);
    }

    expandNode(raw: IExpandableTreeNode): void {
        const node = this.model.validateNode(raw);
        if (IExpandableTreeNode.is(node) && !node.expanded) {
            this.doExpandNode(node);
        }
    }

    protected doExpandNode(node: IExpandableTreeNode): void {
        node.expanded = true;
        this.fireExpansionChanged(node);
        this.model.refresh(node);
    }

    collapseNode(raw: IExpandableTreeNode): void {
        const node = this.model.validateNode(raw);
        if (IExpandableTreeNode.is(node) && node.expanded) {
            this.doCollapseNode(node);
        }
    }

    protected doCollapseNode(node: IExpandableTreeNode): void {
        node.expanded = false;
        // FIXME: remove node selection
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