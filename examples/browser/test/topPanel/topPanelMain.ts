import { TopPanelPO } from "./PageObject/topPanelPO"

export class TopPanelMain extends TopPanelPO {

    constructor() {
        super();
    }

    /*
    * Tests on File menu
    */

    displaySubmenu() {
        return this.displaysFileSubmenu();
    }

    fileNewTerminalOpens() {
        return this.openNewTerminal();
    }

    fileNewTerminalCloses() {
        return this.closeNewTerminal();
    }

    clickOpen() {
        return this.clickOnOpen();
    }

    clickOpenProblemsView() {
        return this.openProblemsView();
    }
}