import hashlib
import json
from pathlib import Path
import plistlib
import shutil
import stat
import struct
import subprocess
import sys
import zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parent
BUILD=ROOT/"build"
NAME="红课题本"
PRODUCT=BUILD/"dist"/"RedCoursebook"
RELEASE=BUILD/"release"
CONTENTS=BUILD/(NAME+".app")/"Contents"


def check_pages(data,signature,limit,info,resources):
    magic,length,count=struct.unpack_from(">III",data,signature)
    assert magic==0xfade0cc0 and length<=limit
    directories=0
    for i in range(count):
        typ,entry=struct.unpack_from(">II",data,signature+12+8*i)
        if typ!=0 and not 0x1000<=typ<=0x1005:continue
        cd=signature+entry
        magic,_,_,flags,ho,_,special,nslots,size=struct.unpack_from(">9I",data,cd)
        assert magic==0xfade0c02 and flags&2
        hash_len,hash_type,_,shift=struct.unpack_from(">4B",data,cd+36)
        algorithm={1:"sha1",2:"sha256",3:"sha256",4:"sha384"}[hash_type]
        def digest(b):return hashlib.new(algorithm,b).digest()[:hash_len]
        page=1<<shift
        assert nslots==(size+page-1)//page and size<=signature
        for j in range(nslots):
            h=cd+ho+j*hash_len
            assert data[h:h+hash_len]==digest(data[j*page:min(size,(j+1)*page)]),("page hash",j)
        for slot,contents in ((1,info),(3,resources)):
            assert special>=slot
            h=cd+ho-slot*hash_len
            assert data[h:h+hash_len]==digest(contents),("bundle seal",slot)
        directories+=1
    assert directories


def slices(binary,verify=False):
    blob=binary.read_bytes()
    magic,count=struct.unpack_from(">II",blob)
    assert magic==0xcafebabe and count==2
    out={}
    for i in range(count):
        cpu,_,pos,size,_=struct.unpack_from(">IIIII",blob,8+20*i)
        data=blob[pos:pos+size]
        assert struct.unpack_from("<I",data)[0]==0xfeedfacf
        n=struct.unpack_from("<I",data,16)[0];cursor=32;minimum=0
        signature=None
        for _ in range(n):
            cmd,length=struct.unpack_from("<II",data,cursor)
            if cmd==0x32:minimum=struct.unpack_from("<I",data,cursor+12)[0]
            if cmd==0x24:minimum=struct.unpack_from("<I",data,cursor+8)[0]
            if cmd==0x1d:signature=struct.unpack_from("<II",data,cursor+8)
            cursor+=length
        architecture={0x0100000c:"arm64",0x01000007:"x86_64"}[cpu]
        assert minimum and (ROOT/"site"/"bank.json").read_bytes() in data
        assert (ROOT/"site"/"app.mjs").read_bytes() in data
        if verify:
            assert signature
            check_pages(data,*signature,(CONTENTS/"Info.plist").read_bytes(),(CONTENTS/"_CodeSignature"/"CodeResources").read_bytes())
        out[architecture]=(minimum>>16,(minimum>>8)&255,minimum&255)
    return out


def package():
    RELEASE.mkdir(exist_ok=True)
    exe=PRODUCT/"RedCoursebook-win_x64.exe"
    assert exe.read_bytes().startswith(b"MZ") and (ROOT/"site"/"bank.json").read_bytes() in exe.read_bytes()
    shutil.copy2(exe,RELEASE/(NAME+".exe"))
    resources=CONTENTS/"Resources";resources.mkdir(exist_ok=True,parents=True)
    dest=CONTENTS/"MacOS"/"RedCoursebook";dest.parent.mkdir(exist_ok=True)
    shutil.copy2(PRODUCT/"RedCoursebook-mac_universal",dest)
    versions=slices(dest)
    release_version=json.loads((ROOT/"neutralino.config.json").read_text(encoding="utf-8"))["version"]
    def version(v):return ".".join(str(i) for i in v[:2])
    plist={"CFBundleName":NAME,"CFBundleDisplayName":NAME,"CFBundleExecutable":"RedCoursebook",
           "CFBundleIdentifier":"net.reshi.redcoursebook","CFBundlePackageType":"APPL","CFBundleSignature":"????",
           "CFBundleShortVersionString":release_version,"CFBundleVersion":release_version,"NSHighResolutionCapable":True,
           "CFBundleDevelopmentRegion":"zh_CN","CFBundleIconFile":"Coursebook.icns",
           "LSMinimumSystemVersion":version(min(versions.values())),
           "LSMinimumSystemVersionByArchitecture":{k:version(v) for k,v in versions.items()}}
    (CONTENTS/"Info.plist").write_bytes(plistlib.dumps(plist))
    with Image.open(ROOT/"site"/"icon.png") as art:art.save(resources/"Coursebook.icns",sizes=[(16,16),(32,32),(64,64),(128,128),(256,256),(512,512)])
    if sys.platform=="darwin":
        dest.chmod(0o755)
        subprocess.run(["codesign","--force","--sign","-","--timestamp=none",str(CONTENTS.parent)],check=True)
        subprocess.run(["codesign","--verify","--deep","--strict",str(CONTENTS.parent)],check=True)
    else:
        signer=shutil.which("rcodesign") or str(BUILD/("rcodesign.exe" if sys.platform=="win32" else "rcodesign"))
        subprocess.run([signer,"sign",str(CONTENTS.parent)],check=True)
    assert slices(dest,verify=True)==versions
    archive=RELEASE/(NAME+"-macOS通用版.zip")
    with zipfile.ZipFile(archive,"w") as z:
        for f in sorted(CONTENTS.rglob("*")):
            if not f.is_file():continue
            info=zipfile.ZipInfo(f.relative_to(BUILD).as_posix())
            info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=(stat.S_IFREG|(0o755 if f==dest else 0o644))<<16
            z.writestr(info,f.read_bytes())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert stat.S_IMODE(z.getinfo(dest.relative_to(BUILD).as_posix()).external_attr>>16)==0o755
        assert z.read(dest.relative_to(BUILD).as_posix())==dest.read_bytes()
        assert (CONTENTS/"_CodeSignature"/"CodeResources").is_file()
    print("Mach-O verified:",versions,"mac zip",archive.stat().st_size, "Windows",exe.stat().st_size)


if __name__=="__main__":package()
