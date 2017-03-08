import {DataCallback} from "vscode-jsonrpc/lib/messageReader";
import {AbstractStreamMessageReader} from "../stream";
import {Socket} from "./socket";

export class SocketMessageReader extends AbstractStreamMessageReader {

    constructor(protected readonly socket: Socket) {
        super();
    }

    listen(callback: DataCallback): void {
        this.socket.onMessage(data => this.readMessage(data, callback));
        this.socket.onError(reason => this.fireError(reason));
        this.socket.onClose((code, reason) => {
            if (code !== 1000) {
                const error: Error = {
                    name: '' + code,
                    message: `Error during socket reconnect: code = ${code}, reason = ${reason}`
                };
                this.fireError(error);
            }
            this.fireClose();
        });
    }

}
