## Eclipse Theia - `@theia/memory-inspector` example workspace

---

### Description

The workspace provides an easy and reproducible way to test the functionality present in the `@theia/memory-inspector` extension.

### Key Features

1. `memory-inspector-example.cpp`: simple C/C++ program for debug purposes
2. `tasks.json`: task configuration file (executes the compilation of the C/C++ program)
3. `launch.json`: debug launch configuration file (launches the debug session)

### Use Cases

**Testing the `memory-inspector`**

1. open `memory-inspector-example-workspace` as a workspace.
2. compile the program (use `F1` + `Run Task...` and select `compile example`)
3. set breakpoint(s) in `memory-inspector-example.cpp`
4. start the debug session using `Debug` + `Start Debugging` from the main menu
5. open the `memory-view` using `View` + `Memory` from the main menu
6. in the memory view, input `$sp` in the location input field (the `memory-view` should display output)
