# Theia - C/C++ Debugging

In order to use the C/C++ Debugger and correctly attach to a program, you need to have GDB
installed on your system. Also make sure that your OS configuration allows you to attach to
processes. One way to troubleshoot this is to try and use GDB and see if it works: `gdb -p <pid>`.
If something went wrong GDB might tell you the instructions to follow.

Under Ubuntu it would require you to set `/proc/sys/kernel/yama/ptrace_scope` to 0:

```sh
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
