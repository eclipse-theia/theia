# plugin-secondary-window-test

A sample VS Code extension for testing menus, toolbars, and dialogs in Theia secondary windows.

## What it tests

- **Tab bar toolbar buttons** (`editor/title`) — icon buttons that appear in the tab title area
- **Tab context menu** (`editor/title/context`) — right-click menu on the tab
- **Notifications** — `showInformationMessage` / `showWarningMessage` triggered from commands and webview buttons
- **Dialogs** — input boxes, quick picks, and save dialogs triggered from the secondary window
- **Webview message passing** — `postMessage` / `onDidReceiveMessage` across windows
- **Style consistency** — dynamic CSS injection/removal works identically in main and secondary windows

## How to use

1. Open the Command Palette and run **"Secondary Window Test: Open Test Panel"**
2. Verify the webview panel appears with toolbar buttons in the tab bar
3. Right-click the tab to see context menu items
4. Click toolbar buttons and webview buttons to test notifications and dialogs
5. Click the **Toggle Colors** button in the webview or the toolbar icon to verify style changes apply
6. Right-click the tab → **"Move to Secondary Window"** to extract the panel
7. Repeat steps 2–5 in the secondary window and verify everything works correctly

## Commands

| Command | Description |
| --- | --- |
| `secondary-window-test.openPanel` | Opens the test webview panel |
| `secondary-window-test.toolbarAction` | Shows an information notification |
| `secondary-window-test.showDialog` | Shows a warning dialog with action buttons |
| `secondary-window-test.saveFile` | Opens a save file dialog |
| `secondary-window-test.toggleColors` | Toggles an alternate color theme in the webview |
