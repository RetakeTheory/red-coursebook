"""Build the Intel frame-reading fix and combine it with the pinned Apple Silicon runtime."""
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
SOURCE_URL = "https://codeload.github.com/neutralinojs/neutralinojs/zip/refs/tags/v6.10.0"
SOURCE_SHA256 = "a928bd222aa7b52378aa5668320e0c7953b4c2283c3af2b22af9918124add0ad"
OUTPUT = ROOT / "build/mac-runtime/neutralino-mac_universal"


def build():
    if sys.platform != "darwin":
        raise SystemExit("Build this runtime on macOS with Xcode, CMake and Ninja.")
    stock = ROOT / "bin/neutralino-mac_universal"
    if not stock.is_file():
        raise SystemExit("Run prepare_runtime.py to obtain the pinned framework first.")
    with tempfile.TemporaryDirectory(prefix="red-coursebook-runtime-") as temp:
        stage = Path(temp)
        archive = stage / "source.zip"
        with urllib.request.urlopen(SOURCE_URL, timeout=90) as response, archive.open("wb") as target:
            shutil.copyfileobj(response, target)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != SOURCE_SHA256:
            raise ValueError("Unexpected Neutralino 6.10.0 source archive")
        with zipfile.ZipFile(archive) as source:
            source.extractall(stage)
        source_root = stage / "neutralinojs-6.10.0"
        window = source_root / "api/window/window.cpp"
        code = window.read_text(encoding="utf-8")
        old = '''    CGRect winPos = ((CGRect (*)(id, SEL))objc_msgSend)(
        (id) windowHandle, "frame"_sel);
    return winPos;'''
        header = "#include <objc/objc-runtime.h>"
        if code.count(old) != 1 or code.count(header) != 1:
            raise ValueError("Unrecognized Cocoa window implementation")
        # Let the Objective-C++ compiler choose the correct struct-return convention on Intel.
        code = code.replace(header, "#import <AppKit/NSWindow.h>\n" + header)
        window.write_text(code.replace(old, "    return [(NSWindow *)windowHandle frame];"), encoding="utf-8")
        out = stage / "objects"
        subprocess.run(["cmake", "-S", source_root, "-B", out, "-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release",
                        "-DCMAKE_OSX_ARCHITECTURES=x86_64", "-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0"], check=True)
        subprocess.run(["cmake", "--build", out, "--parallel", "3"], check=True)
        arm = stage / "arm64"
        universal = stage / "neutralino-mac_universal"
        subprocess.run(["lipo", stock, "-thin", "arm64", "-output", arm], check=True)
        subprocess.run(["lipo", "-create", arm, source_root / "bin/neutralino-mac_x64",
                        "-output", universal], check=True)
        arches = subprocess.check_output(["lipo", "-archs", universal], text=True).split()
        if set(arches) != {"arm64", "x86_64"}:
            raise ValueError(f"Unexpected Mac runtime architectures: {arches}")
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(universal, OUTPUT)


if __name__ == "__main__":
    build()
