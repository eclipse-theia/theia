import { ContainerModule } from "inversify";
import { FileSystem } from "./file-system";
import { InMemoryFileSystem } from "./inmemory";
import { Path } from "./path";
import { CommandContribution, SimpleCommand } from "../../application/common/command";
import { MenuBarContribution } from "../../application/common/menu";

export const inmemoryModule = new ContainerModule(bind => {
    const fileSystem = new InMemoryFileSystem();
    fileSystem.writeFile(Path.fromString("foo/Foo.txt"), 'Hello World');
    fileSystem.writeFile(Path.fromString("bar/Bar.txt"), 'Hello World');
    fileSystem.writeFile(Path.fromString("bar/Baz.txt"), 'Hello World');
    bind<FileSystem>(FileSystem).toConstantValue(fileSystem);
});
