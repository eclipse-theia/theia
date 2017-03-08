import {MessageConnection, createMessageConnection, Trace, Logger} from "vscode-jsonrpc";
import {Socket} from "./socket";
import {SocketMessageReader} from "./reader";
import {SocketMessageWriter} from "./writer";

export function createSocketConnection(socket: Socket, logger: Logger): MessageConnection {
    const messageReader = new SocketMessageReader(socket);
    const messageWriter = new SocketMessageWriter(socket);
    const connection = createMessageConnection(messageReader, messageWriter, logger);
    connection.trace(Trace.Off, logger);
    connection.onClose(() => connection.dispose());
    return connection;
}
