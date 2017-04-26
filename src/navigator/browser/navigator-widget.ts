import { injectable, inject, decorate } from "inversify";
import { h } from "@phosphor/virtualdom";
import { Message } from "@phosphor/messaging";

import { TreeWidget, VirtualWidget, ITreeNode, ISelectableTreeNode } from "./tree";
import { TheiaPlugin, TheiaApplication } from "../../application/browser";
import { FileNavigatorModel, DirNode, FileStatNode } from "./navigator-model";
import { ContextMenuRenderer } from "../../application/browser/menu/context-menu-renderer";
import NodeProps = TreeWidget.NodeProps;

export const FILE_NAVIGATOR_CLASS = 'theia-FileNavigator';
export const ROOT_ACTIVE_CLASS = 'theia-mod-selected';
export const CONTEXT_MENU_PATH = 'navigator-context-menu';
export const FILE_STAT_NODE_CLASS = 'theia-FileStatNode';
export const DIR_NODE_CLASS = 'theia-DirNode';
export const FILE_STAT_ICON_CLASS = 'theia-FileStatIcon';

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
        if (FileStatNode.is(node)) {
            classNames.push(FILE_STAT_NODE_CLASS);
        }
        if (DirNode.is(node)) {
            classNames.push(DIR_NODE_CLASS);
        }
        return classNames;
    }

    protected decorateCaption(node: ITreeNode, caption: h.Child, props: NodeProps): h.Child {
        if (FileStatNode.is(node)) {
            return this.decorateFileStatCaption(node, caption, props);
        }
        return super.decorateCaption(node, caption, props);
    }

    protected decorateFileStatCaption(node: FileStatNode, caption: h.Child, props: NodeProps): h.Child {
        const icon = h.span({ className: FILE_STAT_ICON_CLASS });
        return super.decorateCaption(node, VirtualWidget.merge(icon, caption), props);
    }
}

@injectable()
export class FileNavigatorContribution implements TheiaPlugin {

    constructor( @inject(FileNavigatorWidget) private fileNavigator: FileNavigatorWidget) {
    }

    onStart(app: TheiaApplication): void {
        this.fileNavigator.getModel().refresh();
        app.shell.addToLeftArea(this.fileNavigator);
    }

}
