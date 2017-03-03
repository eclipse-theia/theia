import {Widget} from "@phosphor/widgets";
import {Message} from "@phosphor/messaging";
import {DisposableCollection} from "@theia/platform-common";
import {h, VirtualNode, VirtualText, VirtualDOM, ElementAttrs, ElementInlineStyle} from "@phosphor/virtualdom";
import {ITreeModel, ITreeNode, ICompositeTreeNode, IExpandableTreeNode} from "./model";

export const EXPANDABLE_NODE_CAPTION_CLASS = 'theia-ExpandableTreeNode-caption';
export const EXPANSION_TOGGLE_CLASS = 'theia-expansionToggle';
export const COLLAPSED_CLASS = 'theia-mod-collapsed';


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
        if (model.root) {
            const context = this.createRootContext();
            return this.doRenderNode(model.root, context);
        }
        return null;
    }

    protected createRootContext(): TreeRenderContext {
        return {
            level: 0,
            indentSize: 0,
            visible: true
        };
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

    protected renderNode(node: ITreeNode, context: TreeRenderContext): h.Child {
        const children = context.children && context.children();
        if (!ITreeNode.isVisible(node)) {
            return children || null;
        }
        const caption = context.caption && context.caption() || node.name;
        return h.div(
            TreeRenderContext.toAttributes(node, context),
            VirtualWidget.merge(caption, children)
        );
    }

    protected renderCompositeNode(node: ICompositeTreeNode, context: TreeRenderContext): h.Child {
        const children = context.children || (() => this.renderChildNodes(node.children, context));
        return this.renderNode(node, {
            ...context, children
        });
    }

    protected renderExpandableNode(node: IExpandableTreeNode, context: TreeRenderContext): h.Child {
        const expansionToggleSize: Size = {
            width: 16,
            height: 16,
            ...context.expansionToggleSize
        };
        return this.renderCompositeNode(node, {
            ...context,
            caption: () => {
                const expansionToggle = h.span({
                    className: `${EXPANSION_TOGGLE_CLASS}${node.expanded ? '' : ' ' + COLLAPSED_CLASS}`,
                    style: {
                        width: `${expansionToggleSize.width}px`,
                        height: `${expansionToggleSize.height}px`
                    },
                    onclick: () => {
                        if (this.model && this.model.expansion) {
                            this.model.expansion.toggleNodeExpansion(node);
                        }
                    }
                });
                return h.div({
                    className: EXPANDABLE_NODE_CAPTION_CLASS
                }, expansionToggle, node.name)
            },
            children: () => {
                const indentSize = ITreeNode.isVisible(node) ? expansionToggleSize.width : context.indentSize;
                return this.renderChildNodes(node.children, {
                    ...context,
                    indentSize,
                    visible: node.expanded
                })
            }
        });
    }

    protected renderChildNodes(nodes: ReadonlyArray<ITreeNode>, context: TreeRenderContext): h.Child {
        return VirtualWidget.flatten(nodes.map(node => this.doRenderNode(node, {
            ...context,
            level: context.level + 1
        })));
    }

}

export interface Size {
    width: number
    height: number
}

export interface TreeRenderContext {
    readonly level: number
    readonly indentSize: number
    readonly visible: boolean
    readonly caption?: () => h.Child
    readonly attributes?: ElementAttrs
    readonly children?: () => h.Child
    readonly [key: string]: any;
    readonly expansionToggleSize?: Readonly<Partial<Size>>
}

export namespace TreeRenderContext {
    export function toAttributes(node: ITreeNode, context: TreeRenderContext): ElementAttrs {
        return {
            ...context.attributes,
            style: toStyle(node, context)
        };
    }

    export function toStyle(node: ITreeNode, context: TreeRenderContext): ElementInlineStyle {
        const style = !!context.attributes ? context.attributes.style : undefined;
        return {
            paddingLeft: `${context.indentSize}px`,
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
