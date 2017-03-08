import {AbstractStreamMessageWriter} from "../stream";
import {Socket} from "./socket";

export class SocketMessageWriter extends AbstractStreamMessageWriter {

    constructor(protected readonly socket: Socket) {
        super();
    }

    protected send(content: string): void {
        try {
            this.socket.send(content);
        } catch (e) {
            this.fireError(e.toString());
        }
    }

}
