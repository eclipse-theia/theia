import { MessageConnection, RequestType } from "vscode-jsonrpc";
import { FileSystem, FileSystemWatcher, FileChangeEvent, FileChangeType, FileChange } from "../filesystem";
import { Path } from "../path";
import { Disposable, DisposableCollection } from "../../../application/common";
import {
    LsRequest,
    ExistsRequest,
    DirExistsRequest,
    FileExistsRequest,
    CreateNameRequest,
    DidChangeFilesNotification,
    DidChangeFilesParam,
    ReadFileRequest,
    MkdirRequest,
    RmRequest,
    СpRequest,
    RenameRequest,
    RmdirRequest,
    PathResult,
    BooleanResult,
    WriteFileRequest,
    ToUriRequest
} from "./filesystem-protocol";
import { AbstractFileSystemConnectionHandler } from "./filesystem-handler";

export class FileSystemClient extends AbstractFileSystemConnectionHandler implements FileSystem {

    protected readonly watchers: FileSystemWatcher[] = [];
    protected connection: MessageConnection | undefined;
    protected readonly connectionListeners = new DisposableCollection();

    protected _resolveConnection: (() => void) | undefined;
    protected _resolveConnectionPromise: Promise<MessageConnection |  undefined> |  undefined;

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
        if (this._resolveConnection)  {
            this._resolveConnection();
        }
        this.initialize();
    }

    protected resolveConnection(): Promise<MessageConnection | undefined> {
        const connection = this.connection;
        if (connection) {
            return Promise.resolve(connection);
        }
        if (this._resolveConnectionPromise) {
            return this._resolveConnectionPromise;
        }
        return this._resolveConnectionPromise = new Promise<MessageConnection | undefined>(resolve => {
            this._resolveConnection = () => {
                this._resolveConnection = undefined;
                this._resolveConnectionPromise = undefined;
                resolve(this.connection);
            }
        });
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
        const param = { path: path.toString() };
        return this.sendRequest(LsRequest.type, param, { paths: [] }).then(result =>
            result.paths.map(p => Path.fromString(p))
        );
    }

    chmod(path: Path, mode: number): Promise<boolean> {
        throw Error('chmod is no implemented yet');
    }

    mkdir(path: Path, mode?: number): Promise<boolean> {
        const param = { path: path.toString() };
        return this.sendBooleanRequest(MkdirRequest.type, param);
    }

    rename(oldPath: Path, newPath: Path): Promise<boolean> {
        const param = {from: oldPath.toString(), to: newPath.toString()};
        return this.sendBooleanRequest(RenameRequest.type, param);
    }

    rmdir(path: Path): Promise<boolean> {
        const param = { path: path.toString() };
        return this.sendBooleanRequest(RmdirRequest.type, param);
    }

    rm(path: Path): Promise<boolean> {
        const param = { path: path.toString() };
        return this.sendBooleanRequest(RmRequest.type, param);
    }

    cp(from: Path, to: Path): Promise<string> {
        const param = {from: from.toString(), to: to.toString()};
        return this.sendPathRequest(СpRequest.type, param);
    }

    readFile(path: Path, encoding: string): Promise<string> {
        const param = {
            path: path.toString(),
            encoding
        };
        return this.sendRequest(ReadFileRequest.type, param, { content: '' }).then(result => result.content);
    }

    writeFile(path: Path, data: string, encoding?: string): Promise<boolean> {
        const param = {
            path: path.toString(),
            content: data,
            encoding
        };
        return this.sendBooleanRequest(WriteFileRequest.type, param);
    }

    exists(path: Path): Promise<boolean> {
        const param = {path: path.toString()};
        return this.sendBooleanRequest(ExistsRequest.type, param);
    }

    dirExists(path: Path): Promise<boolean> {
        const param = { path: path.toString() };
        return this.sendBooleanRequest(DirExistsRequest.type, param);
    }

    fileExists(path: Path): Promise<boolean> {
        const param = { path: path.toString() };
        return this.sendBooleanRequest(FileExistsRequest.type, param);
    }

    createName(path: Path): Promise<string> {
        const param = { path: path.toString() };
        return this.sendPathRequest(CreateNameRequest.type, param);
    }

    watch(watcher: FileSystemWatcher): Disposable {
        this.watchers.push(watcher);
        const onDispose = (): void => {
            const index = this.watchers.indexOf(watcher);
            if (index !== -1) {
                this.watchers.splice(index, 1);
            }
        };
        return {
            dispose() {
                onDispose();
            }
        }
    }

    toUri(path: Path): Promise<string |  null> {
        const param = { path: path.toString() };
        return this.sendRequest(ToUriRequest.type, param, { uri: null }).then(result => result.uri);
    }

    protected sendBooleanRequest<P>(type: RequestType<P, BooleanResult, void, void>, params: P): Promise<boolean> {
        return this.sendRequest(type, params, { value: false }).then(result => result.value);
    }

    protected sendPathRequest<P>(type: RequestType<P, PathResult, void, void>, params: P): Promise<string> {
        return this.sendRequest(type, params, { path: '' }).then(result => result.path);
    }

    protected sendRequest<P, R>(type: RequestType<P, R, void, void>, params: P, defaultResult: R): Promise<R> {
        return this.resolveConnection().then(connection => {
            if (connection) {
                return connection.sendRequest(type, params);
            }
            return defaultResult;
        });
    }

}
