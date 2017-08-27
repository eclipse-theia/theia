import 'mocha';
import "webdriverio"
import { assert } from "chai"
import { MainPage } from "./pages/main-page"

describe('theia main elements loading', () => {
    let url = '/';
    let mainPage: MainPage;

    before(() => {
        browser.url(url);
        mainPage = new MainPage(browser);

    });

    it('theia panels are loaded', () => {

        mainPage.waitForLoadingPanels();
        assert.isTrue(mainPage.isMainContentPanelLoaded());
    });

    it('files panel is showing', () => {
        mainPage.waitForLoadingPanels();

        // Panel is closed
        assert.isFalse(mainPage.isFileNavigatorOpen());

        // Panel is open
        mainPage.clickFilesSideTab();
        assert.isTrue(mainPage.isFileNavigatorOpen());

        // Panel is closed
        mainPage.clickFilesSideTab();
        assert.isFalse(mainPage.isFileNavigatorOpen());
    });

    it('menu shows up correctly', () => {
        mainPage.waitForLoadingPanels();

        // No menu list is shown
        assert.isFalse(mainPage.isSubMenuShowing());

        // Click on the first child of the menu bar
        mainPage.clickMenuTab(1);

        // Make sure the menu has appeared and that the tab is active
        mainPage.waitForLoadingMenu();
        assert.isTrue(mainPage.isTabActive(1));

        // Make sure the menu location is directly under the bar tab
        let firstTabX = mainPage.getxBarTabPosition(1);
        let menuX = mainPage.getxMenuPosition();
        assert.equal(firstTabX, menuX);

        // Test with the second tab
        // Move the cursor over the second tab
        mainPage.hoverMenuTab(2);

        // Make sure the menu has appeared and that the second tab is active (thus having the first tab inactive)
        mainPage.waitForLoadingMenu();

        assert.isTrue(mainPage.isTabActive(2));
        assert.isFalse(mainPage.isTabActive(1));

        // Make sure the menu location is directly under the bar tab
        let secondTabX = mainPage.getxBarTabPosition(2);
        menuX = mainPage.getxMenuPosition();
        assert.equal(secondTabX, menuX);

        // Clicking back on the tab closes the menu
        mainPage.clickMenuTab(2);
        // No menu list is shown
        assert.isFalse(mainPage.isSubMenuShowing());
    });
});