import {ITreeSelectionService, ISelectableTreeNode, ITreeModel} from "../model";
import {Emitter, Event} from "@theia/platform-common";

/**
 * Created by kosyakov on 02.03.17.
 */
export class BaseTreeSelectionService implements ITreeSelectionService {

    protected _selectedNode: ISelectableTreeNode | undefined;
    protected readonly onSelectionChangedEmitter = new Emitter<ISelectableTreeNode | undefined>();

    constructor(protected readonly model: ITreeModel) {
    }

    get selectedNode(): ISelectableTreeNode | undefined {
        return this._selectedNode;
    }

    get onSelectionChanged(): Event<ISelectableTreeNode | undefined> {
        return this.onSelectionChangedEmitter.event;
    }

    protected fireSelectionChanged(): void {
        this.onSelectionChangedEmitter.fire(this._selectedNode);
    }

    selectNode(raw: ISelectableTreeNode | undefined): void {
        const node = this.model.validateNode(raw);
        if (ISelectableTreeNode.is(node) && !node.selected) {
            this.doSelectNode(node);
        } else {
            this.doSelectNode(undefined);
        }
    }

    protected doSelectNode(node: ISelectableTreeNode | undefined): void {
        if (this._selectedNode) {
            this._selectedNode.selected = false;
        }
        this._selectedNode = node;
        if (node) {
            node.selected = true;
        }
        this.fireSelectionChanged();
    }

}
