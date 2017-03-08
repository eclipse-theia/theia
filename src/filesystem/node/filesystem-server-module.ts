import {ContainerModule, inject, injectable} from "inversify";
import {ExpressContribution} from "../../application/node";
import {MessageConnectionHandler} from "../../messaging/node";
import {FileSystem} from "../common";
import {FileSystemServer} from "../common/messaging";
import {MessageConnection} from "vscode-jsonrpc";

export const fileSystemServerModule = new ContainerModule(bind => {
    bind<ExpressContribution>(MessageConnectionHandler).to(FileSystemMessageConnectionHandler);
});

@injectable()
export class FileSystemMessageConnectionHandler implements MessageConnectionHandler {

    readonly path = '/fileSystem';

    constructor(@inject(FileSystem) protected readonly fileSystem: FileSystem) {
    }

    handle(connection: MessageConnection): void {
        FileSystemServer.connect(this.fileSystem, connection)
    }

}
