"""Build the offline Android app with JDK 17+, Node.js and Android SDK Build Tools."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ANDROID = Path(__file__).resolve().parent
ROOT = ANDROID.parent
SHARED_ASSETS = (
    "style.css", "mark.svg", "bank.json", "mao.json", "reshi.jpg", "miraitowa.jpg", "ailing.jpg",
    "reshi-44.png", "reshi-88.png", "reshi-132.png", "reshi-176.png", "LICENSE.txt",
)


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def java_tool(name):
    exe = name + (".exe" if os.name == "nt" else "")
    if os.environ.get("JAVA_HOME"):
        return Path(os.environ["JAVA_HOME"]) / "bin" / exe
    return exe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, default=os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT"))
    parser.add_argument("--keystore", type=Path, help="Release key. Supply its password in REDBOOK_KEYSTORE_PASSWORD.")
    parser.add_argument("--alias", default="redcoursebook")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not args.sdk:
        parser.error("Set ANDROID_HOME or pass --sdk.")
    if args.keystore and (not args.keystore.is_file() or not os.environ.get("REDBOOK_KEYSTORE_PASSWORD")):
        parser.error("Signing requires the existing keystore and REDBOOK_KEYSTORE_PASSWORD.")
    sdk = args.sdk.resolve()
    tools = sdk / "build-tools" / "35.0.0"
    platform = sdk / "platforms" / "android-35" / "android.jar"
    suffix = ".exe" if os.name == "nt" else ""
    aapt = tools / ("aapt2" + suffix)
    align = tools / ("zipalign" + suffix)
    d8 = tools / "lib/d8.jar"
    signer = tools / "lib/apksigner.jar"
    for path in (platform, aapt, align, d8, signer):
        if not path.is_file():
            parser.error(f"Missing Android SDK component: {path}")
    bundler = ANDROID / "node_modules/esbuild/lib/main.js"
    if not bundler.exists():
        parser.error("Install the locked bundler with npm ci --prefix android.")
    version = json.loads((ROOT / "neutralino.config.json").read_text("utf-8"))["version"]
    major, minor, patch = map(int, version.split("."))
    version_code = major * 10000 + minor * 100 + patch
    builds = ROOT / "build"
    builds.mkdir(exist_ok=True)
    default = "release/RedCoursebook-Android.apk" if args.keystore else "android/RedCoursebook-unsigned.apk"
    output = (args.output or builds / default).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="apk-", dir=output.parent) as tmp:
        stage = Path(tmp)
        assets = stage / "assets"
        assets.mkdir()
        for name in SHARED_ASSETS:
            shutil.copyfile(ROOT / "site" / name, assets / name)
        template = (ANDROID / "mobile/index.html").read_text("utf-8")
        (assets / "index.html").write_text(template.replace("{{VERSION}}", version), encoding="utf-8")
        shutil.copyfile(ANDROID / "mobile/mobile.css", assets / "mobile.css")
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        if not npm:
            parser.error("Node.js and npm are required.")
        run(npm, "--silent", "--prefix", ANDROID, "run", "bundle", "--", "--outfile=" + str(assets / "book.js"))

        compiled = stage / "resources.zip"
        package = stage / "app.apk"
        run(aapt, "compile", "--dir", ANDROID / "res", "-o", compiled)
        run(aapt, "link", "-o", package, "-I", platform, "--manifest", ANDROID / "AndroidManifest.xml",
            "--version-code", version_code, "--version-name", version, "-A", assets, compiled)
        classes = stage / "classes"
        classes.mkdir()
        run(java_tool("javac"), "--release", "8", "-encoding", "UTF-8", "-g:none", "-classpath", platform,
            "-d", classes, *sorted((ANDROID / "src").rglob("*.java")))
        jar = stage / "classes.jar"
        with zipfile.ZipFile(jar, "w", zipfile.ZIP_DEFLATED) as archive:
            for entry in sorted(classes.rglob("*.class")):
                archive.write(entry, entry.relative_to(classes).as_posix())
        dex = stage / "dex"
        dex.mkdir()
        run(java_tool("java"), "-cp", d8, "com.android.tools.r8.D8", "--release", "--min-api", "26",
            "--lib", platform, "--output", dex, jar)
        with zipfile.ZipFile(package, "a", zipfile.ZIP_DEFLATED) as archive:
            archive.write(dex / "classes.dex", "classes.dex")
        aligned = stage / "aligned.apk"
        run(align, "-f", "4", package, aligned)
        artifact = aligned
        if args.keystore:
            artifact = stage / "signed.apk"
            run(java_tool("java"), "-jar", signer, "sign", "--ks", args.keystore, "--ks-key-alias", args.alias,
                "--ks-pass", "env:REDBOOK_KEYSTORE_PASSWORD", "--v4-signing-enabled", "false", "--out", artifact, aligned)
            run(java_tool("java"), "-jar", signer, "verify", "--verbose", artifact)
        run(align, "-c", "4", artifact)
        os.replace(artifact, output)
    print(output)


if __name__ == "__main__":
    main()
