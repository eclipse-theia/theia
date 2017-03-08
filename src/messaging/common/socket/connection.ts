import {MessageConnection, createMessageConnection} from "vscode-jsonrpc";
import {ConsoleLogger} from "../logger";
import {Socket} from "./socket";
import {SocketMessageReader} from "./reader";
import {SocketMessageWriter} from "./writer";

export function createSocketConnection(socket: Socket, onConnect: (connection: MessageConnection) => void): void {
    socket.onOpen(() => {
        const logger = new ConsoleLogger();
        const messageReader = new SocketMessageReader(socket);
        const messageWriter = new SocketMessageWriter(socket);
        const connection = createMessageConnection(messageReader, messageWriter, logger);
        connection.onClose(() => connection.dispose());
        onConnect(connection);
    });
}
