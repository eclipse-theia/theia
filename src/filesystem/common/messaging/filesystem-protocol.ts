import { RequestType, NotificationType } from "vscode-jsonrpc";
import { FileChangeType } from "../file-system";

export interface FileChange {
    path: string;
    type: FileChangeType;
}

export interface PathParam {
    path: string
}

export interface LsResult {
    paths: string[]
}

export namespace LsRequest {
    export const type = new RequestType<PathParam, LsResult, void, void>('fileSystem/ls');
}

export interface BooleanResult {
    value: boolean
}

export interface PathResult {
    path: string
}

export namespace DirExistsRequest {
    export const type = new RequestType<PathParam, BooleanResult, void, void>('fileSystem/dirExists');
}

export namespace FileExistsRequest {
    export const type = new RequestType<PathParam, BooleanResult, void, void>('fileSystem/fileExists');
}

export namespace CreateNameRequest {
    export const type = new RequestType<PathParam, PathResult, void, void>('fileSystem/createName');
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

export namespace RmRequest {
    export const type = new RequestType<PathParam, BooleanResult, void, void>('fileSystem/rm');
}

export interface СpParam {
    from: string;
    to: string;
}

export namespace СpRequest {
    export const type = new RequestType<СpParam, BooleanResult, void, void>('fileSystem/cp');
}

export namespace MkdirRequest {
    export const type = new RequestType<PathParam, BooleanResult, void, void>('fileSystem/mkdir');
}

export namespace RmdirRequest {
    export const type = new RequestType<PathParam, BooleanResult, void, void>('fileSystem/rmdir');
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
