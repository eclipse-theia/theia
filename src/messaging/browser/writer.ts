import {AbstractStreamMessageWriter} from "../common";

export class WebSocketMessageWriter extends AbstractStreamMessageWriter {

    protected socket: WebSocket;

    constructor(socket: WebSocket) {
        super();
        this.socket = socket;
    }

    protected send(content: string): void {
        this.socket.send(content);
    }

}
