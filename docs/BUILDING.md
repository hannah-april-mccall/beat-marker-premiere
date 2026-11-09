# Building

Users install release packages; these steps are for maintainers. Build and Adobe-sign each package on its target OS. Adobe's signing tool has platform-specific verification behaviour, so do not produce Windows signatures on a Mac or vice versa.

## Offline engine

Use Python 3.12, PyInstaller 6.16.0 and a native compiler/toolchain. Install Torch and Torchaudio 2.6.0 (CPU wheels on Windows), followed by `engine/requirements.txt` and PyInstaller. Windows FFmpeg builds use MSYS2 UCRT64 with GCC, make and diffutils.

```sh
python scripts/fetch_assets.py
bash scripts/build_ffmpeg.sh
python scripts/build_engine.py
```

On Mac, FFmpeg defaults to `MACOSX_DEPLOYMENT_TARGET=14.0`. Verify the resulting binaries' minimum OS as well as their architecture. The build fetcher verifies SHA-256 digests of the model and FFmpeg source. The builder freezes the engine, collects dependency notices, includes corresponding FFmpeg source/configuration, generates `runtime.json`, and runs a relocated offline smoke test with a restricted system PATH.

The generic engine protocol is version 0.4.0; the CEP extension and installers are version 0.6.0. The runtime contains no Blender dependency. `.build/runtime/<platform>` can also be populated from an independently verified build of the same generic worker protocol.

## Adobe package

Obtain Adobe's official `ZXPSignCmd` 4.1.3 for the target OS. Keep the signing certificate and password outside source control and release assets. Generate a self-signed CEP certificate using Adobe's documented `-selfSignedCert` command or use an existing release certificate. Do not install it as a system-trusted certificate.

```sh
python scripts/package.py --runtime .build/runtime/macos-arm64 --signer /path/to/ZXPSignCmd --certificate /private/path/release.p12 --password-file /private/path/password.txt
python scripts/make_macos_installer.py
```

`package.py` stages a clean symlink-free extension, signs it, verifies both the ZXP and extracted folder, and compares every staged file's content with the archive. It removes an existing output archive before signing because Adobe's tool can otherwise retain stale content. A trusted timestamp service is used by default; a signature without a trusted timestamp expires with its signing certificate.

For native Windows builds without Python on the test PC, the task transfer helper `scripts/build-windows-local.cmd` expects `extension/` including its verified runtime, `tools/ZXPSignCmd.exe`, portable NSIS in `tools/nsis/`, and `installer.nsi`. It signs and verifies locally, extracts the signed folder, and compiles the per-user installer. The temporary `.private/` signing folder must never be copied into distribution assets.

## Verification

```sh
node --test extension/tests/*.test.js tests/runtime.test.js
python -m unittest discover -s extension/tests -p "test_*.py"
node tests/engine-integration.js .build/macos-arm64/signed-extension /path/to/test-audio.wav .build/engine-check.json
```

Also test native installation, upgrade, removal, and actual Premiere loading with CEP 12 PlayerDebugMode set to `0`. Check analysis, clip markers, alignment and the panel's whole-operation Undo in a disposable project. Engine command-line checks alone cannot prove that Premiere accepted an Adobe signature. Record the exact package hash and tested Premiere/OS versions.

## OS publisher signatures

Adobe CEP signing is separate from Apple's and Microsoft's installer signing. To provide ordinary public-download installation, sign/notarise the Mac runtime and packages using the publisher's Apple Developer identities, and sign the Windows installer using the publisher's Authenticode certificate. Sign native components **before** creating the Adobe signature; later modifications invalidate it. Keep all private keys and account credentials out of this repository.
