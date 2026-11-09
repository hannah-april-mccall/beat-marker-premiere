# Release verification — 0.6.0

Checked on 9 November 2026. These checks cover the exact generated installers; public-download OS publisher verification remains outstanding.

| Check | Mac | Windows |
| --- | --- | --- |
| Native build and Adobe signature/timestamp verification | Passed | Passed |
| Fresh per-user installation | Passed | Passed |
| Installed files equal signed payload | 2,292 files matched | 2,404 files matched |
| Premiere opens signed CEP panel with PlayerDebugMode `0` | Passed, Premiere 26.5.2 | Passed, Premiere 2026 |
| Bundled engine, restricted system PATH, offline generated audio | Passed, 49 beats | Passed, 49 beats |
| Actual Premiere panel analysis | Passed | Passed, 82 beats in test clip |
| Add clip markers in disposable project | Covered by host tests | Passed, 82 markers |
| Preview and apply seven edits | Covered by planner/host tests | Passed; host verified resulting timing |
| Panel Undo restores linked video and audio | Covered by host tests | Passed, 14 clips restored |
| Recoverable native removal and reinstall | Passed; saved data retained | Not yet separately exercised |

Mac installation was tested on macOS 26.6.2, Apple Silicon. The FFmpeg executables were rebuilt with a macOS 14.0 minimum; all inspected frozen native libraries had lower minimum versions. A macOS 14 machine has not been separately tested. Windows UI testing used the supplied office PC through Parsec and a generated-media project.

51 JavaScript tests passed. Nine Python rhythm-recovery tests passed; one optional check using a local historical cache was skipped. The relocated engine integration check ran twice, verified cache reuse, and compared every file's content before and after analysis to ensure the signed installation stayed unchanged. Paths containing spaces and `&` were included. No test music, private project files, signing credentials or local analysis caches are included in the repository or installers.

The previous prototype installation and saved Undo receipts were preserved during the Mac upgrade. The initial Windows installer test exposed a current-directory lock during folder replacement; the final installer releases that directory before renaming, and its fresh installation and full Premiere workflow passed.
