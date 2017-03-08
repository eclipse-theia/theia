export interface Socket {
    send(content: string): void;
    onOpen(cb: () => void): void;
    onMessage(cb: (data: any) => void): void;
    onError(cb: (reason: any) => void): void;
    onClose(cb: (code: number, reason: string) => void): void;
}
