import { injectable, inject, decorate } from "inversify";
import { Workspace } from "../../languages/common";
import { FileSystem, Path } from "../../filesystem/common";
import { MonacoWorkspace as BaseMonacoWorkspace, MonacoToProtocolConverter } from "monaco-languageclient";

decorate(injectable(), BaseMonacoWorkspace);
decorate(inject(MonacoToProtocolConverter), BaseMonacoWorkspace, 0);

@injectable()
export class MonacoWorkspace extends BaseMonacoWorkspace implements Workspace {
    protected resolveReady: () => void;
    readonly ready = new Promise<void>(resolve => {
        this.resolveReady = resolve;
    });
    constructor(
        @inject(FileSystem) fileSystem: FileSystem,
        @inject(MonacoToProtocolConverter) m2p: MonacoToProtocolConverter
    ) {
        super(m2p);
        fileSystem.toUri(Path.ROOT).then(rootUri => {
            this._rootUri = rootUri;
            this.resolveReady();
        });
    }
}
