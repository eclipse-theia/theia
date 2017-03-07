import {RequestType, NotificationType} from "vscode-jsonrpc";
import {FileChangeEvent} from "../file-system";

export type Path = string;

export declare namespace LsRequest {
    const type: RequestType<Path, Path[], void, void>;
}

export declare namespace DirExistsRequest {
    const type: RequestType<Path, boolean, void, void>;
}

export declare namespace DidChangeFilesNotification {
    const type: NotificationType<FileChangeEvent, void>;
}
