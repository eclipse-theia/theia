import {Widget} from "@phosphor/widgets";
import {Message} from "@phosphor/messaging";
import {DisposableCollection} from "@theia/platform-common";
import {h, VirtualNode, VirtualText, VirtualDOM} from "@phosphor/virtualdom";
import {ITreeModel, ITreeNode, ICompositeTreeNode, IExpandableTreeNode} from "./model";

export class TreeWidget<Model extends ITreeModel> extends Widget {

    /**
     * FIXME extract to VirtualWidget
     */
    protected model: Model | undefined;
    protected modelListeners = new DisposableCollection();

    constructor(model?: Model) {
        super();
        this.setModel(model);
    }

    getModel() {
        return this.model;
    }

    setModel(model: Model | undefined) {
        if (this.model !== model) {
            this.modelListeners.dispose();
            this.model = model;
            if (model) {
                this.modelListeners.push(model.onChanged(() => this.update()));
            }
            this.update();
        }
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        const children = this.render();
        const content = VirtualWidget.toContent(children);
        VirtualDOM.render(content, this.node);
    }

    protected render(): h.Child {
        if (this.model) {
            return this.renderTree(this.model);
        }
        return null;
    }

    protected renderTree(model: Model): h.Child {
        return this.renderChildNodes(model.roots);
    }

    protected renderNode(node: ITreeNode): h.Child {
        return h.div(node.name);
    }

    protected renderCompositeNode(node: ICompositeTreeNode): h.Child {
        const children = IExpandableTreeNode.getChildren(node);
        const nodes = this.renderChildNodes(children);
        return h.div({
                onclick: () => {
                    if (IExpandableTreeNode.is(node) && this.model && this.model.expansion) {
                        this.model.expansion.toggleNodeExpansion(node);
                    }
                }
            },
            VirtualWidget.merge(node.name, nodes)
        );
    }

    protected renderChildNodes(nodes: ReadonlyArray<ITreeNode>): h.Child {
        return VirtualWidget.flatten(nodes.map(node => this.doRenderNode(node)));
    }

    protected doRenderNode(node: ITreeNode | undefined): h.Child {
        if (!node) {
            return null;
        }
        if (ICompositeTreeNode.is(node)) {
            return this.renderCompositeNode(node);
        }
        return this.renderNode(node);
    }

}

export namespace VirtualWidget {
    export function flatten(children: h.Child[]): h.Child {
        return children.reduce((prev, current) => this.merge(prev, current), null);
    }

    export function merge(left: h.Child, right: h.Child): h.Child {
        if (!left) {
            return right;
        }
        if (!right) {
            return left;
        }
        const result = left instanceof Array ? left : [left];
        if (right instanceof Array) {
            result.push(...right);
        } else {
            result.push(right);
        }
        return result;
    }

    export function toContent(children: h.Child): VirtualNode | VirtualNode[] | null {
        if (!children) {
            return null;
        }
        if (typeof children === "string") {
            return new VirtualText(children);
        }
        if (children instanceof Array) {
            const nodes: VirtualNode[] = [];
            for (const child of children) {
                if (child) {
                    const node = typeof child === "string" ? new VirtualText(child) : child;
                    nodes.push(node);
                }
            }
            return nodes;
        }
        return children;
    }
}
