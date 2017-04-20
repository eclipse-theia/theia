import { FileCommandContribution, FileMenuContribution } from '../browser/filesystem-commands';
import {ContainerModule } from "inversify";
import {FileSystem} from "../common";
import {FileSystemClient} from "../common/messaging/filesystem-client";
import {listen} from "../../messaging/browser/connection";
import {CommandContribution} from "../../application/common/command";
import {MenuContribution} from "../../application/common/menu";

export const fileSystemClientModule = new ContainerModule(bind => {
    const fileSystemClient = new FileSystemClient();
    listen(fileSystemClient);
    bind<FileSystem>(FileSystem).toConstantValue(fileSystemClient);
    bind<CommandContribution>(CommandContribution).to(FileCommandContribution);
    bind<MenuContribution>(MenuContribution).to(FileMenuContribution);
});

