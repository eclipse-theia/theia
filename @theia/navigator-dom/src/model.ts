import {ITreeModel, ITreeNode} from "./tree/model";
import {Emitter, Event} from "@theia/platform-common";
import {FileSystem, Path} from "@theia/fs-common";

export class FileNavigatorModel implements ITreeModel {

    protected _roots: ITreeNode[] = [];
    protected readonly onChangedEmitter = new Emitter<void>();

    constructor(protected readonly fileSystem: FileSystem) {
        this.fileSystem.ls(Path.fromString("")).then(
            paths => this.setRoots(paths)
        );
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

    protected setRoots(paths: Path[]): void {
        this._roots = paths.reduce((nodes: ITreeNode[], path: Path) => {
            const node = this.toNode(path);
            if (node) {
                nodes.push(node);
            }
            return nodes;
        }, []);
        this.fireChanged();
    }

    protected toNode(path: Path): ITreeNode | undefined {
        const name = path.simpleName;
        if (name) {
            return {
                name,
                parent: undefined
            }
        }
        return undefined;
    }

}