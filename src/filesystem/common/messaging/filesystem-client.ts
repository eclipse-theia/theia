import {MessageConnection} from "vscode-jsonrpc";
import {FileSystem, FileSystemWatcher} from "../file-system";
import {Path} from "../path";
import {Disposable} from "../../../application/common/disposable";
import {LsRequest, DirExistsRequest, DidChangeFilesNotification} from "./filesystem-protocol";

export class FileSystemClient implements FileSystem {

    protected readonly watchers: FileSystemWatcher[] = [];

    constructor(protected readonly connection: MessageConnection) {
        this.connection.onNotification(DidChangeFilesNotification.type, event => {
            for (const watcher of this.watchers) {
                watcher(event);
            }
        });
    }

    isRoot(path: Path): boolean {
        throw Error('chmod is no implemented yet');
    }

    ls(path: Path): Promise<Path[]> {
        return Promise.resolve(this.connection.sendRequest(LsRequest.type, path.toString()).then(paths =>
            paths.map(p => Path.fromString(p))
        ));
    }

    chmod(path: Path, mode: number): Promise<boolean> {
        throw Error('chmod is no implemented yet');
    }

    mkdir(path: Path, mode?: number): Promise<boolean> {
        throw Error('mkdir is no implemented yet');
    }

    rename(oldPath: Path, newPath: Path): Promise<boolean> {
        throw Error('rename is no implemented yet');
    }

    rmdir(path: Path): Promise<boolean> {
        throw Error('rmdir is no implemented yet');
    }

    rm(path: Path): Promise<boolean> {
        throw Error('rm is no implemented yet');
    }

    readFile(path: Path, encoding: string): Promise<string> {
        throw Error('readFile is no implemented yet');
    }

    writeFile(path: Path, data: string, encoding?: string): Promise<boolean> {
        throw Error('writeFile is no implemented yet');
    }

    exists(path: Path): Promise<boolean> {
        throw Error('exists is no implemented yet');
    }

    dirExists(path: Path): Promise<boolean> {
        return Promise.resolve(this.connection.sendRequest(DirExistsRequest.type, path.toString()));
    }

    fileExists(path: Path): Promise<boolean> {
        throw Error('fileExists is no implemented yet');
    }

    watch(watcher: FileSystemWatcher): Disposable {
        this.watchers.push(watcher);
        return {
            dispose() {
                const index = this.watchers.indexOf(watcher);
                if (index !== -1) {
                    this.watchers.splice(index, 1);
                }
            }
        }
    }

}