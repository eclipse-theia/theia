import {ReadableStream} from "./stream";
import {AbstractMessageReader, DataCallback, StreamMessageReader} from "vscode-jsonrpc/lib/messageReader";

export abstract class AbstractStreamMessageReader extends AbstractMessageReader {

    abstract listen(callback: DataCallback): void;

    protected readMessage(message: any, callback: DataCallback) {
        const readable = new ReadableStream(message);
        const reader = new StreamMessageReader(readable);
        reader.onError(e => this.fireError(e));
        reader.onClose(() => this.fireClose());
        reader.onPartialMessage(info => this.firePartialMessage(info));
        reader.listen(callback);
    }

}
