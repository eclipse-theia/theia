import {Message} from "vscode-jsonrpc/lib/messages";
import {MessageWriter, AbstractMessageWriter, StreamMessageWriter} from "vscode-jsonrpc/lib/messageWriter";
import {WritableStream} from "./stream";

export abstract class AbstractStreamMessageWriter extends AbstractMessageWriter implements MessageWriter {

    write(msg: Message): void {
        const content = this.writeMessage(msg);
        this.send(content);
    }

    protected writeMessage(msg: Message): string {
        const writable = new WritableStream();
        const writer = new StreamMessageWriter(writable);
        writer.onError(e => this.fireError(e));
        writer.onClose(() => this.fireClose());
        writer.write(msg);
        writable.end();
        return writable.data.toString();
    }

    protected abstract send(content: string): void;

}
