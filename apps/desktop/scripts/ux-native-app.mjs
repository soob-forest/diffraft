import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// A unique bundle lets native UI tools select only the disposable E2E process.
export async function prepareUxNativeApp(app) {
  const contents = join(app, ".artifacts/ux-native/DocReview UX.app/Contents");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await copyFile(
    join(app, "src-tauri/target/debug/docreview"),
    join(contents, "MacOS/docreview"),
  );
  await writeFile(
    join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>local.diffraft.docreview.ux-validation</string>
<key>CFBundleExecutable</key><string>docreview</string>
<key>CFBundleName</key><string>DocReview UX</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
</dict></plist>\n`,
  );
}
