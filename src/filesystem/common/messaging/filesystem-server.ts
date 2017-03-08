import {MessageConnection} from "vscode-jsonrpc";
import {FileSystem} from "../file-system";
import {
    LsRequest,
    DirExistsRequest,
    DidChangeFilesNotification,
    FileChange,
    LsResult,
    ExistsResult,
    ReadFileRequest,
    ReadFileResult
} from "./filesystem-protocol";
import {Path} from "../path";
import {DisposableCollection} from "../../../application/common/disposable";

export namespace FileSystemServer {

    export function connect(fileSystem: FileSystem, connection: MessageConnection): void {
        connection.onRequest(LsRequest.type, (param, token) =>
            fileSystem.ls(Path.fromString(param.path)).then(paths =>
                <LsResult>{
                    paths: paths.map(p => p.toString())
                }
            )
        );
        connection.onRequest(DirExistsRequest.type, (param, token) =>
            fileSystem.dirExists(Path.fromString(param.path)).then(exists => <ExistsResult>{exists})
        );
        connection.onRequest(ReadFileRequest.type, (param, token) =>
            fileSystem.readFile(Path.fromString(param.path), param.encoding).then(content => <ReadFileResult>{content})
        );
        const toDispose = new DisposableCollection();
        toDispose.push(fileSystem.watch(event => {
            const changes = event.changes.map(change => <FileChange>{
                path: change.path.toString(),
                type: change.type
            });
            connection.sendNotification(DidChangeFilesNotification.type, {changes});
        }));
        connection.onDispose(() => toDispose.dispose());
        connection.listen();
    }

}
