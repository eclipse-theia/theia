import {injectable, inject} from "inversify";
import {FileSystem, Path, FileChangeEvent, FileChangeType} from "../../filesystem/common";
import {OpenerService} from "../../application/browser";
import {
    ITree,
    ITreeSelectionService,
    ITreeExpansionService,
    ITreeNode,
    ICompositeTreeNode,
    IExpandableTreeNode,
    TreeModel,
    Tree
} from "./tree";
import {ISelectableTreeNode} from "./tree/tree-selection";

@injectable()
export class FileNavigatorModel extends TreeModel {

    constructor(@inject(FileSystem) protected readonly fileSystem: FileSystem,
                @inject(OpenerService) protected readonly openerService: OpenerService,
                @inject(ITree) tree: ITree,
                @inject(ITreeSelectionService) selection: ITreeSelectionService,
                @inject(ITreeExpansionService) expansion: ITreeExpansionService) {
        super(tree, selection, expansion);
        this.toDispose.push(fileSystem.watch(event => this.onFileChanged(event)));
    }

    protected onFileChanged(event: FileChangeEvent): void {
        const affectedNodes = this.getAffectedNodes(event);
        if (affectedNodes) {
            affectedNodes.forEach(node => this.refresh(node));
        }
    }

    protected getAffectedNodes(event: FileChangeEvent): ICompositeTreeNode[] {
        const nodes: IDirNode[] = [];
        for (const change of event.changes) {
            const path = change.path;
            const affectedPath = change.type > FileChangeType.UPDATED ? path.parent : path;
            const id = affectedPath.toString();
            const node = this.getNode(id);
            if (IDirNode.is(node) && node.expanded) {
                nodes.push(node);
            }
        }
        return nodes;
    }

    protected doOpenNode(node: ITreeNode): void {
        if (IFileNode.is(node)) {
            this.openerService.open(node.path);
        } else {
            super.doOpenNode(node);
        }
    }
}

@injectable()
export class FileNavigatorTree extends Tree {

    static ROOT = Path.fromString("");

    constructor(@inject(FileSystem) protected readonly fileSystem: FileSystem) {
        super();
        this.root = this.createRootNode();
    }

    protected createRootNode(): IDirNode {
        const path = FileNavigatorTree.ROOT;
        const id = path.toString();
        return {
            id, path,
            name: '/',
            visible: false,
            parent: undefined,
            children: [],
            expanded: true,
            selected: false
        }
    }

    resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        const path = IPathNode.is(parent) ? parent.path : undefined;
        if (path) {
            return this.fileSystem.ls(path).then(paths => this.toNodes(paths, parent));
        }
        return super.resolveChildren(parent);
    }

    protected toNodes(paths: Path[], parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        return Promise.all(paths.map(path => this.toNode(path, parent))).then(nodes =>
            (nodes.filter(node => !!node) as ITreeNode[]).sort(IDirNode.compare)
        );
    }

    protected toNode(path: Path, parent: ICompositeTreeNode): Promise<IFileNode | IDirNode | undefined> {
        const name = path.simpleName;
        if (!name) {
            return Promise.resolve(undefined);
        }
        const id = path.toString();
        const node = this.getNode(id);
        return this.fileSystem.dirExists(path).then(exists => {
            if (exists) {
                if (IDirNode.is(node)) {
                    return node;
                }
                return <IDirNode>{
                    id, path, name, parent,
                    expanded: false,
                    selected: false,
                    children: []
                }
            }
            if (IPathNode.is(node)) {
                return node;
            }
            return <IFileNode>{
                id, path, name, parent,
                selected: false
            }
        });
    }

}

export interface IPathNode extends ISelectableTreeNode {
    readonly path: Path;
}

export type IDirNode = IPathNode & IExpandableTreeNode;
export type IFileNode = IPathNode;

export namespace IFileNode {
    export function is(node: ITreeNode | undefined): node is IFileNode {
        return IPathNode.is(node) && !IExpandableTreeNode.is(node);
    }
}

export namespace IDirNode {
    export function is(node: ITreeNode | undefined): node is IDirNode {
        return IPathNode.is(node) && IExpandableTreeNode.is(node);
    }

    export function compare(node: ITreeNode, node2: ITreeNode): number {
        return IDirNode.dirCompare(node, node2) || node.name.localeCompare(node2.name);
    }

    export function dirCompare(node: ITreeNode, node2: ITreeNode): number {
        const a = IDirNode.is(node) ? 1 : 0;
        const b = IDirNode.is(node2) ? 1 : 0;
        return b - a;
    }
}

export namespace IPathNode {
    export function is(node: ITreeNode | undefined): node is IPathNode {
        return !!node && 'path' in node;
    }
}
