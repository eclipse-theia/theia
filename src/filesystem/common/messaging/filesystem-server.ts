import {inject, injectable} from "inversify";
import {MessageConnection} from "vscode-jsonrpc";
import {FileSystem} from "../file-system";
import {
    LsRequest,
    DirExistsRequest,
    DidChangeFilesNotification,
    FileChange,
    LsResult,
    BooleanResult,
    ReadFileRequest,
    ReadFileResult,
    WriteFileRequest
} from "./filesystem-protocol";
import {Path} from "../path";
import {DisposableCollection} from "../../../application/common/disposable";
import {AbstractFileSystemConnectionHandler} from "./filesystem-handler";

@injectable()
export class FileSystemServer extends AbstractFileSystemConnectionHandler {

    constructor(@inject(FileSystem) protected readonly fileSystem: FileSystem) {
        super();
    }

    onConnection(connection: MessageConnection): void {
        connection.onRequest(LsRequest.type, (param, token) =>
            this.fileSystem.ls(Path.fromString(param.path)).then(paths =>
                <LsResult>{
                    paths: paths.map(p => p.toString())
                }
            )
        );
        connection.onRequest(DirExistsRequest.type, (param, token) =>
            this.fileSystem.dirExists(Path.fromString(param.path)).then(value => <BooleanResult>{value})
        );
        connection.onRequest(ReadFileRequest.type, (param, token) =>
            this.fileSystem.readFile(Path.fromString(param.path), param.encoding).then(content => <ReadFileResult>{content})
        );
        connection.onRequest(WriteFileRequest.type, (param, token) =>
            this.fileSystem.writeFile(Path.fromString(param.path), param.content, param.encoding).then(value => <BooleanResult>{value})
        );
        const toDispose = new DisposableCollection();
        toDispose.push(this.fileSystem.watch(event => {
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
