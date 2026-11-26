"""Verify the published bundle on macOS, launch its process and check its served assets."""
from pathlib import Path
import hashlib
import json
import os
import plistlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="redcoursebook-check-") as tmp:
    root=Path(tmp)
    subprocess.run(["ditto","-x","-k",sys.argv[1],str(root)],check=True)
    app=root/"红课题本.app"
    info=plistlib.loads((app/"Contents/Info.plist").read_bytes())
    binary=app/"Contents/MacOS"/info["CFBundleExecutable"]
    assert info["CFBundleIdentifier"]=="net.reshi.redcoursebook" and os.access(binary,os.X_OK)
    assert info["CFBundleShortVersionString"]==json.loads((ROOT/"neutralino.config.json").read_text())["version"]
    subprocess.run(["codesign","--verify","--deep","--strict","--verbose=2",str(app)],check=True)
    arches=subprocess.check_output(["lipo","-archs",str(binary)],text=True).split()
    assert set(arches)=={"arm64","x86_64"}
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
    proc=subprocess.Popen([str(binary),"--port="+str(port),"--window-use-saved-state=false"],cwd=root)
    try:
        base=f"http://127.0.0.1:{port}/"
        for _ in range(100):
            if proc.poll() is not None:raise RuntimeError("Desktop application exited early")
            try:
                with urllib.request.urlopen(base,timeout=1) as r:page=r.read().decode()
                if "红课题本" in page:break
            except OSError:pass
            time.sleep(.3)
        else:raise RuntimeError("Desktop application did not start")
        assets=["bank.json","mao.json","app.mjs","style.css","reshi.jpg","miraitowa.jpg","ailing.jpg","LICENSE.txt"]
        assets.extend(f"reshi-{size}.png" for size in [44,88,132,176])
        for asset in assets:
            with urllib.request.urlopen(base+asset,timeout=5) as r:served=r.read()
            assert served==(ROOT/"site"/asset).read_bytes(),asset
        print("Native launch, universal architectures, Apple code signature and bundled assets verified",flush=True)
    finally:
        if proc.poll() is None:proc.terminate()
        proc.wait(timeout=10)
