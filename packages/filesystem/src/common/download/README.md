# Theia - File Download

Provides the file download contribution to the `Files` navigator.

Supports single and multi file downloads.
 1. A single file will be downloaded as is.
 2. Folders will be downloaded az tar archives.
 3. When downloading multiple files, the name of the closest common parent directory will be used for the archive.
 4. When downloading multiple files from multiple disks (for instance: `C:\` and `D:\` on Windows), then we apply rule `3.` per disks and we tar the tars.

### REST API

 - To download a single file or folder use the following endpoint: `GET /files/?uri=/encoded/file/uri/to/the/resource`.
   - Example: `curl -X GET http://localhost:3000/files/?uri=file:///Users/akos.kitta/git/theia/package.json`.

 - To download multiple files (from the same folder) use the `PUT /files/` endpoint with the `application/json` content type header and the following body format:
    ```json
    {
        "uri": [
            "/encoded/file/uri/to/the/resource",
            "/another/encoded/file/uri/to/the/resource"
        ]
    }
    ```
   ```
   curl -X PUT -H "Content-Type: application/json" -d '{ "uris": ["file:///Users/akos.kitta/git/theia/package.json", "file:///Users/akos.kitta/git/theia/README.md"] }' http://localhost:3000/files/
   ```

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)