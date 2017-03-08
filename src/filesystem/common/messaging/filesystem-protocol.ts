import {RequestType, NotificationType} from "vscode-jsonrpc";
import {FileChangeType} from "../file-system";

export type Path = string;

export interface FileChange {
    path: string;
    type: FileChangeType;
}

export interface PathParam {
    path: Path
}

export interface LsResult {
    paths: Path[]
}

export namespace LsRequest {
    export const type = new RequestType<PathParam, LsResult, void, void>('fileSystem/ls');
}

export interface ExistsResult {
    exists: boolean
}

export namespace DirExistsRequest {
    export const type = new RequestType<PathParam, ExistsResult, void, void>('fileSystem/dirExists');
}

export interface DidChangeFilesParam {
    changes: FileChange[];
}

export namespace DidChangeFilesNotification {
    export const type = new NotificationType<DidChangeFilesParam, void>('fileSystem/didChangeFiles');
}
