
import {FileSystem, Path, FileChangeEvent, FileChangeType} from "@theia/fs-common";
import {ITreeNode, ICompositeTreeNode, IExpandableTreeNode} from "./tree";
import {BaseTreeModel, BaseTreeExpansionService} from "./tree/base";
import { injectable, inject , decorate} from "inversify";

decorate(injectable(), BaseTreeModel);
@injectable()
export class FileNavigatorModel extends BaseTreeModel {

    static ROOT = Path.fromString("");

    constructor( @inject(FileSystem) protected readonly fileSystem: FileSystem) {
        super();
        this.expansion = new BaseTreeExpansionService(this);
        this.toDispose.push(fileSystem.watch(event => this.onFileChanged(event)));
        this.root = this.createRootNode();
    }

    protected createRootNode(): IDirNode {
        const path = FileNavigatorModel.ROOT;
        const id = path.toString();
        return {
            id, path,
            name: '/',
            visible: false,
            parent: undefined,
            children: [],
            expanded: true
        }
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

    resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        const path = IPathNode.is(parent) ? parent.path : undefined;
        if (path) {
            return this.fileSystem.ls(path).then(paths => this.toNodes(paths, parent));
        }
        return super.resolveChildren(parent);
    }

    protected toNodes(paths: Path[], parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        return Promise.all(paths.map(path => this.toNode(path, parent))).then(nodes => {
            const result: ITreeNode[] = [];
            for (const node of nodes) {
                if (node) {
                    result.push(node);
                }
            }
            return result;
        });
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
                    children: []
                }
            }
            if (IPathNode.is(node)) {
                return node;
            }
            return <IFileNode>{
                id, path, name, parent
            }
        });
    }

}

export interface IPathNode extends ITreeNode {
    readonly path: Path;
}

export type IDirNode = IPathNode & IExpandableTreeNode;
export type IFileNode = IPathNode;

export namespace IDirNode {
    export function is(node: ITreeNode | undefined): node is IDirNode {
        return IPathNode.is(node) && IExpandableTreeNode.is(node);
    }
}

export namespace IPathNode {
    export function is(node: ITreeNode | undefined): node is IPathNode {
        return !!node && 'path' in node;
    }
}
