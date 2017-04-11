import { Disposable } from "../../../application/common";

export interface Socket extends Disposable {
    send(content: string): void;
    onMessage(cb: (data: any) => void): void;
    onError(cb: (reason: any) => void): void;
    onClose(cb: (code: number, reason: string) => void): void;
}
