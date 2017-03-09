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

export interface BooleanResult {
    value: boolean
}

export namespace DirExistsRequest {
    export const type = new RequestType<PathParam, BooleanResult, void, void>('fileSystem/dirExists');
}

export interface ReadFileParam extends PathParam {
    encoding: string
}

export interface ReadFileResult {
    content: string
}

export namespace ReadFileRequest {
    export const type = new RequestType<ReadFileParam, ReadFileResult, void, void>('fileSystem/readFile');
}

export interface WriteFileParam extends PathParam {
    content: string;
    encoding?: string;
}

export namespace WriteFileRequest {
    export const type = new RequestType<WriteFileParam, BooleanResult, void, void>('fileSystem/writeFile');
}

export interface DidChangeFilesParam {
    changes: FileChange[];
}

export namespace DidChangeFilesNotification {
    export const type = new NotificationType<DidChangeFilesParam, void>('fileSystem/didChangeFiles');
}
