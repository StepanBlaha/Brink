# winget manifest for Brink (StepanBlaha.Brink)

Templates only. Nothing here is submitted automatically.

## First submission (by hand, after the Windows release is published)

1. Publish the GitHub release `win-vX.Y.Z` (see `../../RELEASING.md`).
2. Download `SHA256SUMS.txt` from it, then run `./render.sh X.Y.Z path/to/SHA256SUMS.txt`.
3. On Windows: `winget validate --manifest out/StepanBlaha.Brink/X.Y.Z` and test with
   `winget settings --enable LocalManifestFiles; winget install --manifest out/StepanBlaha.Brink/X.Y.Z`.
4. Fork `microsoft/winget-pkgs`, copy the folder to `manifests/s/StepanBlaha/Brink/X.Y.Z/`, open a PR.
   Or: `wingetcreate new <x64-url> <arm64-url>` and follow the prompts.

## Updates

`wingetcreate update StepanBlaha.Brink --version X.Y.Z --urls <x64-url> <arm64-url> --submit`
(needs a GitHub token with `public_repo`, kept outside the repo).

## Notes

- Installer type `nullsoft` (Tauri NSIS), `Scope: user`, silent switch `/S`.
- Hashes in the manifest must be the SHA256 of the exact published files. Unsigned builds change the hash
  if re-built, so never replace assets after the manifest is submitted.
