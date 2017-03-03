import {Widget} from "@phosphor/widgets";
import {Message} from "@phosphor/messaging";
import {DisposableCollection} from "@theia/platform-common";
import {h, VirtualNode, VirtualText, VirtualDOM, ElementAttrs, ElementInlineStyle} from "@phosphor/virtualdom";
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
        return this.renderChildNodes(model.roots, {
            level: 0,
            visible: true
        });
    }

    protected renderNode(node: ITreeNode, context: TreeRenderContext): h.Child {
        return h.div(
            TreeRenderContext.toAttributes(context),
            VirtualWidget.merge(node.name, context.children)
        );
    }

    protected renderCompositeNode(node: ICompositeTreeNode, context: TreeRenderContext): h.Child {
        const children = context.children === undefined ? this.renderChildNodes(node.children, context) : context.children;
        return this.renderNode(node, {
            ...context, children
        });
    }

    protected renderExpandableNode(node: IExpandableTreeNode, context: TreeRenderContext): h.Child {
        return this.renderCompositeNode(node, {
            ...context,
            attributes: {
                onclick: () => {
                    if (this.model && this.model.expansion) {
                        this.model.expansion.toggleNodeExpansion(node);
                    }
                }
            },
            children: this.renderChildNodes(node.children, {
                ...context,
                visible: node.expanded
            })
        });
    }

    protected renderChildNodes(nodes: ReadonlyArray<ITreeNode>, context: TreeRenderContext): h.Child {
        return VirtualWidget.flatten(nodes.map(node => this.doRenderNode(node, {
            ...context,
            level: context.level + 1
        })));
    }

    protected doRenderNode(node: ITreeNode | undefined, context: TreeRenderContext): h.Child {
        if (!node) {
            return null;
        }
        if (IExpandableTreeNode.is(node)) {
            return this.renderExpandableNode(node, context);
        }
        if (ICompositeTreeNode.is(node)) {
            return this.renderCompositeNode(node, context);
        }
        return this.renderNode(node, context);
    }

}

export interface TreeRenderContext {
    readonly level: number
    readonly visible: boolean
    readonly attributes?: ElementAttrs
    readonly children?: h.Child
}

export namespace TreeRenderContext {
    export function toAttributes(context: TreeRenderContext): ElementAttrs {
        return {
            ...context.attributes,
            style: toStyle(context)
        };
    }

    export function toStyle(context: TreeRenderContext): ElementInlineStyle {
        const style = !!context.attributes ? context.attributes.style : undefined;
        return {
            paddingLeft: `${12 * context.level}px`,
            display: context.visible ? 'block' : 'none',
            ...style
        };
    }
}

export namespace VirtualWidget {
    export function flatten(children: h.Child[]): h.Child {
        return children.reduce((prev, current) => this.merge(prev, current), null);
    }

    export function merge(left: h.Child, right: h.Child | undefined): h.Child {
        if (!right) {
            return left;
        }
        if (!left) {
            return right;
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
