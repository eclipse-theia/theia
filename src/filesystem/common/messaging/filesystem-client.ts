import {MessageConnection} from "vscode-jsonrpc";
import {FileSystem, FileSystemWatcher, FileChangeEvent, FileChangeType, FileChange} from "../file-system";
import {Path} from "../path";
import {Disposable, DisposableCollection} from "../../../application/common";
import {LsRequest, DirExistsRequest, DidChangeFilesNotification, DidChangeFilesParam} from "./filesystem-protocol";

export class FileSystemClient implements FileSystem {

    protected readonly watchers: FileSystemWatcher[] = [];
    protected _connection: MessageConnection | undefined;
    protected readonly connectionListeners = new DisposableCollection();

    get connection(): MessageConnection | undefined {
        return this._connection;
    }

    set connection(connection: MessageConnection | undefined) {
        this.connectionListeners.dispose();
        this._connection = connection;
        if (this._connection) {
            let disposed = false;
            const handler = (params: DidChangeFilesParam) => {
                if (!disposed) {
                    this.notifyWatchers(new FileChangeEvent(
                        params.changes.map(change => new FileChange(
                            Path.fromString(change.path),
                            change.type
                            )
                        )));
                }
            };
            this.connectionListeners.push({
                dispose() {
                    disposed = true;
                }
            });
            this._connection.onNotification(DidChangeFilesNotification.type, handler);
            // FIXME we should have the initialize request
            this.notifyWatchers({
                changes: [{
                    path: Path.fromString(""),
                    type: FileChangeType.UPDATED
                }]
            });
            this._connection.listen();
        }
    }

    protected notifyWatchers(event: FileChangeEvent): void {
        for (const watcher of this.watchers) {
            watcher(event);
        }
    }

    isRoot(path: Path): boolean {
        throw Error('isRoot is no implemented yet');
    }

    ls(path: Path): Promise<Path[]> {
        const connection = this.connection;
        if (connection) {
            return Promise.resolve(connection.sendRequest(LsRequest.type, {path: path.toString()}).then(result =>
                result.paths.map(p => Path.fromString(p))
            ));
        }
        return Promise.resolve([]);
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
        const connection = this.connection;
        if (connection) {
            return Promise.resolve(connection.sendRequest(DirExistsRequest.type, {path: path.toString()}).then(
                result => result.exists
            ));
        }
        return Promise.resolve(false);
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