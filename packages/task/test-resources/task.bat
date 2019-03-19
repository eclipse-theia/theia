@echo off

for /l %%x in (1,1,3) do (
   echo tasking... %*
   @REM sleep for ~1s
   waitfor nothing /t 1 > nul
)
echo "done"
