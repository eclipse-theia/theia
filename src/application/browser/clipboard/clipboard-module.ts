
import { ContainerModule } from "inversify";

import { ClipboardService } from "../../common/clipboard-service";
import { BrowserClipboardService } from "./browser-clipboard-service";

export const browserClipboardModule = new ContainerModule(bind => {
    bind(ClipboardService).to(BrowserClipboardService).inSingletonScope();
});