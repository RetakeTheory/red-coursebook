"""Verify a published APK against an independently built copy of its offline content."""
import json
import os
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
published = Path(sys.argv[1]).resolve()
rebuilt = ROOT / "build/android/RedCoursebook-unsigned.apk"
sdk_tools = Path(os.environ["ANDROID_HOME"]) / "build-tools/35.0.0"
suffix = ".exe" if os.name == "nt" else ""
version = json.loads((ROOT / "neutralino.config.json").read_text("utf-8"))["version"]
java = str(Path(os.environ["JAVA_HOME"]) / "bin" / ("java" + suffix)) if os.environ.get("JAVA_HOME") else "java"

subprocess.run([java, "-jar", str(sdk_tools / "lib/apksigner.jar"), "verify", "--verbose", str(published)], check=True)
subprocess.run([str(sdk_tools / ("zipalign" + suffix)), "-c", "4", str(published)], check=True)
info = subprocess.check_output([str(sdk_tools / ("aapt2" + suffix)), "dump", "badging", str(published)]).decode("utf-8")
assert "name='net.reshi.redcoursebook'" in info and f"versionName='{version}'" in info
assert "SdkVersion:'26'" in info and "targetSdkVersion:'35'" in info
assert "launchable-activity: name='net.reshi.redcoursebook.CoursebookActivity'" in info
assert "uses-permission:" not in info
with ZipFile(published) as release, ZipFile(rebuilt) as source:
    names = {n for n in source.namelist() if n.startswith("assets/")}
    assert names == {n for n in release.namelist() if n.startswith("assets/")}
    for name in names:
        assert release.read(name) == source.read(name), name
    assert not any(n.startswith("lib/") for n in release.namelist())
print(f"Verified Android {version}, signature, manifest and {len(names)} matching offline assets.")
