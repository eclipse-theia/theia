
import { BasePage } from "../base-page"

<<<<<<< HEAD
export class MainPage extends BasePage {
=======
    constructor(private driver: Client<any>) {
    }

    clickMenuTab(tabNumber: number) {
        this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    hoverMenuTab(tabNumber: number) {
        this.driver.moveToObject(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    /**
     * Selects one of the side tabs.
     * @param index the (0 based) index of the tab. If not present, the first tab (with 0 index) will be selected.
     */
    clickSideTab(index: number = 0) {
        this.driver.click(`ul.p-TabBar-content > .p-TabBar-tab:nth-child(${index})`);
    }

    clickFilesSideTab() {
        this.clickSideTab(1);
    }

    isFileNavigatorOpen(): Boolean {
        return this.isSideTabActive(1);
    }

    isSideTabActive(index: number = 0): Boolean {
        return this.driver.element(`.p-TabBar-content > .p-TabBar-tab:nth-child(${index})`).getAttribute('class').split(' ').indexOf('p-mod-current') === 1;
    }

    isTabActive(tabNumber: number) {
        return this.driver.element(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`).getAttribute('class').split(' ').indexOf('p-mod-active') !== -1;
    }

    waitForLoadingPanels() {
        this.driver.waitForExist('#theia-top-panel');
        this.driver.waitForVisible('#theia-main-content-panel');
    }

    isMainContentPanelLoaded(): boolean {
        return this.driver.element('#theia-main-content-panel').state === 'success';
    }
>>>>>>> 28ebfce9906c8cd8fa75f38706e11c33471a053f

    public constructor() {
        super();
    }

    public loadPanels() {
        this.topPanelExists();
        this.mainContentPanelExits();
    }

    public loadFilePanels() {
        const fileNavigatorIsOpen = this.isFileNavigatorOpenOnClickingFiles();
        const fileNavigatorIsClosed = this.isFileNavigatorClosed();
        console.log("fileNavigatorIsOpen : " + fileNavigatorIsOpen);
        console.log("fileNavigatorIsClosed :" + fileNavigatorIsClosed);
        return (fileNavigatorIsOpen && !fileNavigatorIsClosed)
    }

    public subMenuShowing(): Boolean {
        this.loadPanels();
        return this.subMenuExists();
    }
}