import {DataCallback} from "vscode-jsonrpc/lib/messageReader";
import {AbstractStreamMessageReader} from "../common";

export class WebSocketMessageReader extends AbstractStreamMessageReader {

    protected socket: WebSocket;

    constructor(socket: WebSocket) {
        super();
        this.socket = socket;
    }

    listen(callback: DataCallback): void {
        this.socket.onmessage = event => this.readMessage(event.data, callback);
        this.socket.onerror = event => {
            if (event instanceof ErrorEvent) {
                this.fireError(event.message);
            }
        }
        this.socket.onclose = event => {
            if (event.code !== 1000) {
                const error: Error = {
                    name: '' + event.code,
                    message: `Error during WS reconnect: code = ${event.code}, reason = ${event.reason}`
                };
                this.fireError(error);
            }
            this.fireClose();
        }
    }

}
