import {Plugin, ContainerModule, interfaces} from "@theia/platform-common";
import {FileSystem, InMemoryFileSystem} from "./file-system";

export const frontendPlugin: Plugin = {

    getContainerModule(): ContainerModule {
        return new ContainerModule((bind: interfaces.Bind,
                                    unbind: interfaces.Unbind,
                                    isBound: interfaces.IsBound,
                                    rebind: interfaces.Rebind) => {
            bind<FileSystem>(FileSystem).toConstantValue(new InMemoryFileSystem());
        })
    }

}
