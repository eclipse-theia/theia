import {Widget} from "@phosphor/widgets";
import {Message} from "@phosphor/messaging";
import {DisposableCollection} from "@theia/platform-common";
import {h, VirtualNode, VirtualText, VirtualDOM} from "@phosphor/virtualdom";
import {ITreeModel, ITreeNode, ICompositeTreeNode} from "./model";

export class TreeWidget<Model extends ITreeModel> extends Widget {

    /**
     * FIXME introduce VirtualWidget
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
        const content = this.toContent(children);
        VirtualDOM.render(content, this.node);
    }

    protected toContent(children: h.Child): VirtualNode | VirtualNode[] | null {
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

    protected render(): h.Child {
        if (this.model) {
            return this.doRenderNode(this.model.root);
        }
        return null;
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

    protected renderNode(node: ITreeNode): h.Child {
        return h.div(node.name);
    }

    protected renderCompositeNode(node: ICompositeTreeNode): h.Child {
        const children = node.children.map(child => this.doRenderNode(child));
        return h.div(node.name, h.div(children));
    }

}
