import {Path} from "./path";
import {FileSystem, FileChangeType, FileChange, FileChangeEvent, FileSystemWatcher} from "./file-system";
import {Disposable} from "@theia/platform-common";

class InMemoryFileNode {
    path: Path;
    contents?: string;
    children?: InMemoryFileNode[]
}

export class InMemoryFileSystem implements FileSystem {

    private root: InMemoryFileNode;
    
    constructor() {
        this.root = {
            path: Path.fromString(""),
            children: []
        }
    }

    isRoot(path: Path): boolean {
        return path.equals(this.root.path);
    }

    private find(path: Path): InMemoryFileNode|undefined {
        return this.internalFindNode(this.root, path);
    }

    private internalFindNode(node: InMemoryFileNode, path: Path): InMemoryFileNode|undefined {
        if (node.path.equals(path)) {
            return node;
        }
        if (!node.children)
            return;
        for (let child of node.children) {
            let nestedChild = this.internalFindNode(child, path);
            if (nestedChild)
                return nestedChild;
        }
        return undefined;
    }

    ls(path: Path): Promise<Path[]> {
        const e = this.find(path);
        if (!e) {
            return Promise.reject<Path[]>(`Couldn't find path ${path}`);
        }
        if (!e.children) {
            return Promise.resolve([]);
        }
        return Promise.resolve(e.children.map(n => n.path));
    }

    exists(path: Path): Promise<boolean> {
        let n = this.find(path);
        return Promise.resolve(n !== undefined);
    }

    chmod(path: Path, mode: number): Promise<boolean> {
        return Promise.resolve(true);
    }

    private mkdirSync(path: Path): InMemoryFileNode {
        let exists = this.find(path);
        if (exists) {
            return exists;
        } else {
            let parent = this.mkdirSync(path.parent);
            if (parent.children) {
                let result: InMemoryFileNode = {
                    path,
                    children: []
                };
                parent.children.push(result);
                this.notify(new FileChange(path, FileChangeType.ADDED));
                return result;
            }
        }
        return this.root;
    }

    mkdir(path: Path, mode?: number): Promise<boolean> {
        this.mkdirSync(path);
        return Promise.resolve(true);
    }

    rename(oldPath: Path, newPath: Path): Promise<boolean> {
        throw Error("not supported")
    }

    rmdir(path: Path): Promise<boolean> {
        return this.rm(path);
    }

    rm(path: Path): Promise<boolean> {
        let parentNode = this.find(path.parent);
        if (!parentNode) {
            return Promise.resolve(false);
        }
        if (parentNode.children) {
            for (let child of parentNode.children) {
                if (child.path.equals(path)) {
                    parentNode.children = parentNode.children.filter(e => e !== child);
                    this.notify(new FileChange(path, FileChangeType.DELETED));
                    return Promise.resolve(true);
                }
            }
        }
        return Promise.resolve(false);
    }

    readFile(path: Path, encoding: string): Promise<string> {
        let n = this.find(path);
        if (!n) {
            return Promise.reject("file doesn't exist")
        }
        return Promise.resolve(n.contents);
    }

    writeFile(path: Path, data: string, encoding?: string): Promise<boolean> {
        let parent = this.mkdirSync(path.parent);
        if (!parent.children) {
            return Promise.reject("parent is not a directory");
        }
        let existing = parent.children.find(n => n.path.equals(path));
        if (existing) {
            existing.contents = data;
            this.notify(new FileChange(path, FileChangeType.UPDATED));
        } else {
            parent.children.push({
                path,
                contents: data
            });
            this.notify(new FileChange(path, FileChangeType.ADDED));
        }
        return Promise.resolve(true);
    }

    /**
     * `path` exists and is a directory
     */
    dirExists(path: Path): Promise<boolean> {
        let n = this.find(path);
        return Promise.resolve(n !== undefined && n.children !== undefined);
    }

    /**
     * `path` exists and is a file.
     */
    fileExists(path: Path): Promise<boolean> {
        let n = this.find(path);
        return Promise.resolve(n !== undefined && n.contents !== undefined);
    }

    private notify(...change: FileChange[]): void {
        let event = new FileChangeEvent(change);
        for (let watcher of this.watchers) {
            watcher(event);
        }
    }

    private watchers: FileSystemWatcher[] = [];

    watch(watcher: FileSystemWatcher): Disposable {
        this.watchers.push(watcher);
        let dispose = () => this.watchers.filter(value => value !== watcher);
        return {
            dispose
        }
    }
}
