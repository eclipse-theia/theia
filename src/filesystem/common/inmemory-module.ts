import { ContainerModule } from "inversify";
import { FileSystem } from "./filesystem";
import { InMemoryFileSystem } from "./inmemory";
import { Path } from "./path";

export const inmemoryModule = new ContainerModule(bind => {
    const fileSystem = new InMemoryFileSystem();
    fileSystem.writeFile(Path.fromString("foo/Foo.txt"), 'Hello World');
    fileSystem.writeFile(Path.fromString("bar/Bar.txt"), 'Hello World');
    fileSystem.writeFile(Path.fromString("bar/Baz.txt"), 'Hello World');
    bind<FileSystem>(FileSystem).toConstantValue(fileSystem);
});
