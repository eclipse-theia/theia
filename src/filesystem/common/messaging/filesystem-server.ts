import {MessageConnection} from "vscode-jsonrpc";
import {FileSystem} from "../file-system";
import {LsRequest, DirExistsRequest, DidChangeFilesNotification} from "./filesystem-protocol";
import {Path} from "../path";
import {Disposable} from "../../../application/common/disposable";

export namespace FileSystemServer {

    export function connect(fileSystem: FileSystem, connection: MessageConnection): Disposable {
        connection.onRequest(LsRequest.type, path =>
            fileSystem.ls(Path.fromString(path)).then(paths =>
                paths.map(p => p.toString())
            )
        );
        connection.onRequest(DirExistsRequest.type, path =>
            fileSystem.dirExists(Path.fromString(path))
        );
        return fileSystem.watch(event =>
            connection.sendNotification(DidChangeFilesNotification.type, event)
        );
    }

}
