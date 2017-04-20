
import { ContainerModule } from "inversify";

import { ClipboardService } from "../../common/clipboard-service";
import { ElectronClipboardService } from "./electron-clipboard-service";

export const electronClipboardModule = new ContainerModule(bind => {
    bind(ClipboardService).to(ElectronClipboardService).inSingletonScope();
});