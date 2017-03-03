import {ITreeModel, ITreeNode, ICompositeTreeNode, ITreeExpansionService, ITreeSelectionService} from "../model";
import {Emitter, Event, DisposableCollection} from "@theia/platform-common";

export class BaseTreeModel implements ITreeModel {

    protected _root: ITreeNode | undefined;
    protected readonly onChangedEmitter = new Emitter<void>();
    protected readonly onNodeRefreshedEmitter = new Emitter<ICompositeTreeNode>();

    protected selectionService: ITreeSelectionService | undefined;
    protected readonly selectionListeners = new DisposableCollection();

    protected expansionService: ITreeExpansionService | undefined;
    protected readonly expansionListeners = new DisposableCollection();

    protected readonly toDispose = new DisposableCollection();

    protected nodes: {
        [id: string]: ITreeNode | undefined
    } = {};

    constructor() {
        this.toDispose.push(this.onChangedEmitter);
        this.toDispose.push(this.onNodeRefreshedEmitter);
    }

    dispose(): void {
        this.nodes = {};
        this.toDispose.dispose();
        this.selection = undefined;
        this.expansion = undefined;
    }

    get root(): ITreeNode | undefined {
        return this._root;
    }

    set root(root: ITreeNode | undefined) {
        if (!ITreeNode.equals(this._root, root)) {
            this.nodes = {};
            this._root = root;
            this.addNode(root);
            this.refresh();
        }
    }

    get onChanged(): Event<void> {
        return this.onChangedEmitter.event;
    }

    protected fireChanged(): void {
        this.onChangedEmitter.fire(undefined);
    }

    get onNodeRefreshed(): Event<ICompositeTreeNode> {
        return this.onNodeRefreshedEmitter.event;
    }

    protected fireNodeRefreshed(parent: ICompositeTreeNode): void {
        this.onNodeRefreshedEmitter.fire(parent);
        this.fireChanged();
    }

    getNode(id: string|undefined): ITreeNode|undefined {
        return !!id ? this.nodes[id] : undefined;
    }

    validateNode(node: ITreeNode | undefined): ITreeNode | undefined {
        const id = !!node ? node.id : undefined;
        return this.getNode(id);
    }

    refresh(raw?: ICompositeTreeNode): void {
        const parent = !raw ? this._root : this.validateNode(raw);
        if (ICompositeTreeNode.is(parent)) {
            this.resolveChildren(parent).then(children => this.setChildren(parent, children));
        }
    }

    protected resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        return Promise.resolve([]);
    }

    protected setChildren(parent: ICompositeTreeNode, children: ITreeNode[]): void {
        parent.children.forEach(child => this.removeNode(child));
        parent.children = children;
        parent.children.forEach(child => this.addNode(child));
        this.fireNodeRefreshed(parent);
    }

    protected removeNode(node: ITreeNode | undefined): void {
        if (node) {
            delete this.nodes[node.id];
        }
    }

    protected addNode(node: ITreeNode | undefined): void {
        if (node) {
            this.nodes[node.id] = node;
        }
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
