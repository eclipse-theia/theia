import {ContainerModule, inject} from "inversify";
import * as e from "express";
import * as ws from "ws";
import {ExpressContribution} from "../../application/node";
import {createServerWebSocketConnection} from "../../messaging/node";
import {FileSystem} from "../common";
import {FileSystemServer} from "../common/messaging";

export const fileSystemServerModule = new ContainerModule(bind => {
    bind<ExpressContribution>(ExpressContribution).to(FileSystemServerContribution);
});

export class FileSystemServerContribution implements ExpressContribution {

    constructor(@inject(FileSystem) protected readonly fileSystem: FileSystem) {
    }

    configure(app: e.Application): void {
        const server = new ws.Server({
            server: app.listen(3001),
            path: '/fileSystem' 
        });
        createServerWebSocketConnection(server, connection =>
            FileSystemServer.connect(this.fileSystem, connection)
        );
    }

}
