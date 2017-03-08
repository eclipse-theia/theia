import {ContainerModule} from "inversify";
import {FileSystem} from "../common";
import {FileSystemClient} from "../common/messaging/filesystem-client";
import {createClientWebSocketConnection} from "../../messaging/browser/connection";

export const fileSystemClientModule = (url: string) => new ContainerModule(bind => {
    const fileSystemClient = new FileSystemClient();
    createClientWebSocketConnection(url, connection => fileSystemClient.connection = connection);
    bind<FileSystem>(FileSystem).toConstantValue(fileSystemClient);
});
