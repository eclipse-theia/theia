import {TreeWidget, TreeRenderContext} from "./tree/widget";
import {FileNavigatorModel, IFileNode, IDirNode} from "./navigator-model";
import {TheiaPlugin, TheiaApplication} from "@theia/shell-dom";
import {injectable, inject, decorate} from "inversify";
import {ITreeNode} from "./tree/model";
import {h} from "@phosphor/virtualdom";

export const FILE_NAVIGATOR_CLASS = 'theia-FileNavigator';

decorate(injectable(), TreeWidget);

@injectable()
export class FileNavigator extends TreeWidget<FileNavigatorModel> {

    static readonly ID = 'file-navigator';

    constructor(@inject(FileNavigatorModel) model: FileNavigatorModel) {
        super(model);
        this.addClass(FILE_NAVIGATOR_CLASS);
        this.id = FileNavigator.ID;
        this.title.label = 'Files';
    }

    getModel(): FileNavigatorModel {
        return super.getModel()!;
    }

    protected doRenderNode(node: ITreeNode|undefined, context: TreeRenderContext): h.Child {
        if (IFileNode.is(node)) {
            return this.renderFileNode(node, context);
        }
        if (IDirNode.is(node)) {
            return this.renderDirNode(node, context);
        }
        return super.doRenderNode(node, context);
    }

    protected renderFileNode(node: IFileNode, context: TreeRenderContext): h.Child {
        return this.renderNode(node, context);
    }

    protected renderDirNode(node: IDirNode, context: TreeRenderContext): h.Child {
        return this.renderExpandableNode(node, context);
    }

}

@injectable()
export class FileNavigatorContribution implements TheiaPlugin {

    constructor(@inject(FileNavigator) private fileNavigator: FileNavigator) {
    }

    onStart(app: TheiaApplication): void {
        this.fileNavigator.getModel().refresh();
        app.shell.addToLeftArea(this.fileNavigator);
    }
}