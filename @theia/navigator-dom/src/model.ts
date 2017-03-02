import {ITreeNode, ICompositeTreeNode, IExpandableTreeNode} from "./tree/model";
import {FileSystem, Path} from "@theia/fs-common";
import {BaseTreeModel} from "./tree/base";
import {BaseTreeExpansionService} from "./tree/base/expansion";

export class FileNavigatorModel extends BaseTreeModel {

    static ROOT = Path.fromString("");

    constructor(protected readonly fileSystem: FileSystem) {
        super();
        this.expansion = new BaseTreeExpansionService(this);
    }

    resolveChildren(parent?: ICompositeTreeNode): Promise<ITreeNode[]> {
        const path = !parent ? FileNavigatorModel.ROOT : IPathNode.is(parent) ? parent.path : undefined;
        if (path) {
            return this.fileSystem.ls(path).then(paths => this.toNodes(paths, parent));
        }
        return super.resolveChildren(parent);
    }

    protected toNodes(paths: Path[], parent?: ICompositeTreeNode): Promise<ITreeNode[]> {
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

    protected toNode(path: Path, parent?: ICompositeTreeNode): Promise<IFileNode | IDirNode | undefined> {
        const name = path.simpleName;
        if (!name) {
            return Promise.resolve(undefined);
        }
        return this.fileSystem.dirExists(path).then(exists => {
            if (exists) {
                return <IDirNode>{
                    path, name, parent,
                    expanded: false,
                    children: []
                }
            }
            return <IFileNode>{path, name, parent}
        });
    }

}

export interface IPathNode extends ITreeNode {
    readonly path: Path;
}

export type IDirNode = IPathNode & IExpandableTreeNode;
export type IFileNode = IPathNode;

export namespace IPathNode {
    export function is(node: ITreeNode | undefined): node is IPathNode {
        return !!node && 'path' in node;
    }
}
