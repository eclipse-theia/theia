import {MessageConnection} from "vscode-jsonrpc";
import {FileSystem, FileSystemWatcher, FileChangeEvent, FileChangeType, FileChange} from "../file-system";
import {Path} from "../path";
import {Disposable, DisposableCollection} from "../../../application/common";
import {
    LsRequest,
    DirExistsRequest,
    DidChangeFilesNotification,
    DidChangeFilesParam,
    ReadFileRequest
} from "./filesystem-protocol";
import {AbstractFileSystemConnectionHandler} from "./filesystem-handler";

export class FileSystemClient extends AbstractFileSystemConnectionHandler implements FileSystem {

    protected readonly watchers: FileSystemWatcher[] = [];
    protected connection: MessageConnection | undefined;
    protected readonly connectionListeners = new DisposableCollection();

    onConnection(connection: MessageConnection) {
        this.connectionListeners.dispose();
        this.connection = connection;
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
        this.connection.onNotification(DidChangeFilesNotification.type, handler);
        this.connection.onDispose(() => {
            this.connectionListeners.dispose();
            this.connection = undefined;
        });
        this.connection.listen();
        this.initialize();
    }

    // FIXME we should have the initialize request
    protected initialize(): void {
        this.notifyWatchers({
            changes: [{
                path: Path.ROOT,
                type: FileChangeType.UPDATED
            }]
        });
    }

    protected notifyWatchers(event: FileChangeEvent): void {
        for (const watcher of this.watchers) {
            watcher(event);
        }
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
        const connection = this.connection;
        if (connection) {
            const param = {
                path: path.toString(),
                encoding
            };
            return Promise.resolve(connection.sendRequest(ReadFileRequest.type, param).then(result => result.content));
        }
        return Promise.resolve('');
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
