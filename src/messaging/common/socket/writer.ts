import {AbstractStreamMessageWriter} from "../stream";
import {Socket} from "./socket";

export class SocketMessageWriter extends AbstractStreamMessageWriter {

    constructor(protected readonly socket: Socket) {
        super();
    }

    protected send(content: string): void {
        this.socket.send(content);
    }

}
