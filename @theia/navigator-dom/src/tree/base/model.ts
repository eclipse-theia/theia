import {ITreeModel, ITreeNode, ICompositeTreeNode, ITreeExpansionService, ITreeSelectionService} from "../model";
import {Emitter, Event, DisposableCollection} from "@theia/platform-common";

export class BaseTreeModel implements ITreeModel {

    protected _roots: ITreeNode[] = [];
    protected readonly onChangedEmitter = new Emitter<void>();
    protected readonly onNodeRefreshedEmitter = new Emitter<ICompositeTreeNode | undefined>();

    protected selectionService: ITreeSelectionService | undefined;
    protected selectionListeners = new DisposableCollection();

    protected expansionService: ITreeExpansionService | undefined;
    protected expansionListeners = new DisposableCollection();

    dispose(): void {
        this.onChangedEmitter.dispose();
        this.onNodeRefreshedEmitter.dispose();
        this.selection = undefined;
        this.expansion = undefined;
    }

    get roots(): ReadonlyArray<ITreeNode> {
        return this._roots;
    }

    get onChanged(): Event<void> {
        return this.onChangedEmitter.event;
    }

    protected fireChanged(): void {
        this.onChangedEmitter.fire(undefined);
    }

    get onNodeRefreshed(): Event<ICompositeTreeNode | undefined> {
        return this.onNodeRefreshedEmitter.event;
    }

    protected fireNodeRefreshed(parent?: ICompositeTreeNode): void {
        this.onNodeRefreshedEmitter.fire(parent);
        this.fireChanged();
    }

    validateNode(node: ITreeNode | undefined): ITreeNode | undefined {
        if (!node) {
            return undefined;
        }
        if (node.parent) {
            const parent = this.validateNode(node.parent);
            if (ICompositeTreeNode.is(parent)) {
                return parent.children.filter(child => ITreeNode.equals(node, child))[0];
            }
            return undefined;
        }
        return this._roots.filter(child => ITreeNode.equals(node, child))[0];
    }

    refresh(parent?: ICompositeTreeNode): void {
        this.resolveChildren(parent).then(children => {
            if (parent) {
                parent.children = children;
            } else {
                this._roots = children;
            }
            this.fireNodeRefreshed(parent);
        });
    }

    protected resolveChildren(parent?: ICompositeTreeNode): Promise<ITreeNode[]> {
        return Promise.resolve([]);
    }

    get selection() {
        return this.selectionService;
    }

    set selection(selection: ITreeSelectionService | undefined) {
        this.selectionListeners.dispose();
        this.selectionService = selection;
        if (selection) {
            this.selectionListeners.push(
                selection.onSelectionChanged(() => this.fireChanged())
            );
        }
    }

    get expansion() {
        return this.expansionService;
    }

    set expansion(expansion: ITreeExpansionService | undefined) {
        this.expansionListeners.dispose();
        this.expansionService = expansion;
        if (expansion) {
            this.expansionListeners.push(
                expansion.onExpansionChanged(() => this.fireChanged())
            );
        }
    }

}
