import {injectable, inject, decorate} from "inversify";
import {h} from "@phosphor/virtualdom";
import {Message} from "@phosphor/messaging";

import { TreeWidget, VirtualWidget, ITreeNode, ISelectableTreeNode } from "./tree";
import {TheiaPlugin, TheiaApplication} from "../../application/browser";
import { FileNavigatorModel, IDirNode, IPathNode } from "./navigator-model";
import { ContextMenuRenderer } from "../../application/browser/menu/context-menu-renderer";
import NodeProps = TreeWidget.NodeProps;

export const FILE_NAVIGATOR_CLASS = 'theia-FileNavigator';
export const ROOT_ACTIVE_CLASS = 'theia-mod-selected';
export const CONTEXT_MENU_PATH = 'navigator-context-menu';
export const PATH_NODE_CLASS = 'theia-PathNode';
export const DIR_NODE_CLASS = 'theia-DirNode';
export const PATH_ICON_CLASS = 'theia-PathIcon';

const FILE_NAVIGATOR_PARAMS: TreeWidget.TreeProps = {
    ...TreeWidget.DEFAULT_PROPS,
    contextMenuPath: CONTEXT_MENU_PATH
}

decorate(injectable(), TreeWidget);

@injectable()
export class FileNavigatorWidget extends TreeWidget<FileNavigatorModel> {

    static readonly ID = 'file-navigator';

    constructor(
        @inject(FileNavigatorModel) model: FileNavigatorModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer) {
        super(FILE_NAVIGATOR_PARAMS, contextMenuRenderer);
        this.addClass(FILE_NAVIGATOR_CLASS);
        this.id = FileNavigatorWidget.ID;
        this.title.label = 'Files';
        this.setModel(model);
        this.node.addEventListener(
            'contextmenu',
            (event) => {
                this.showContextMenu(event, this.getModel().root)
            }, false)
        this.node.addEventListener(
            'click',
            (event) => {
                this.selectNode(event, this.getModel().root)
            })
    }

    getModel(): FileNavigatorModel {
        return super.getModel()!;
    }

    protected onUpdateRequest(msg: Message): void {
        if (ISelectableTreeNode.isSelected(this.getModel().root)) {
            this.addClass(ROOT_ACTIVE_CLASS)
        } else {
            this.removeClass(ROOT_ACTIVE_CLASS)
        }
        super.onUpdateRequest(msg);
    }

    protected createNodeClassNames(node: ITreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (IPathNode.is(node)) {
            classNames.push(PATH_NODE_CLASS);
        }
        if (IDirNode.is(node)) {
            classNames.push(DIR_NODE_CLASS);
        }
        return classNames;
    }

    protected decorateCaption(node: ITreeNode, caption: h.Child, props: NodeProps): h.Child {
        if (IPathNode.is(node)) {
            return this.decoratePathCaption(node, caption, props);
        }
        return super.decorateCaption(node, caption, props);
    }

    protected decoratePathCaption(node: IPathNode, caption: h.Child, props: NodeProps): h.Child {
        const pathIcon = h.span({className: PATH_ICON_CLASS});
        return super.decorateCaption(node, VirtualWidget.merge(pathIcon, caption), props);
    }
}

@injectable()
export class FileNavigatorContribution implements TheiaPlugin {

    constructor(@inject(FileNavigatorWidget) private fileNavigator: FileNavigatorWidget) {
    }

    onStart(app: TheiaApplication): void {
        this.fileNavigator.getModel().refresh();
        app.shell.addToLeftArea(this.fileNavigator);
    }

}
