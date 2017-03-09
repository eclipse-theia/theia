import {injectable} from "inversify";
import {ConnectionHandler} from "../../../messaging/common";
import {MessageConnection} from "vscode-jsonrpc";

@injectable()
export abstract class AbstractFileSystemConnectionHandler implements ConnectionHandler {

    readonly path = '/fileSystem';

    abstract onConnection(connection: MessageConnection): void;

}