#!/usr/bin/env python3
"""Read-only MPQ lookup and MDX sequence/texture inventory for workbook towers."""
import bz2
import hashlib
import json
import re
import struct
import zlib
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MAP=Path('/Users/laihanbin/Downloads/maps/刀圈TD 正式版.w3x')
buf=MAP.read_bytes();digest=hashlib.sha256(buf).hexdigest()
assert digest=='835745bd1d65bfff759a715deb59fee8bed3eff341de66403e8ddb44ff0f438a'
base=buf.find(b'MPQ\x1a')
magic,size,archive,version,shift,hash_off,block_off,nh,nb=struct.unpack_from('<4sIIHHIIII',buf,base)
assert version==0
mask=0xffffffff;crypt=[0]*1280;seed=0x100001
for j in range(256):
    for k in range(5):
        seed=(seed*125+3)%0x2aaaab;hi=(seed&0xffff)<<16
        seed=(seed*125+3)%0x2aaaab;crypt[k*256+j]=hi|(seed&0xffff)
def hashed(s,kind):
    a,b=0x7fed7fed,0xeeeeeeee
    for c in s.upper().replace('/','\\').encode('utf-8'):
        a=(crypt[(kind<<8)+c]^((a+b)&mask))&mask;b=(c+a+b+(b<<5)+3)&mask
    return a
def decrypt(raw,key):
    seed=0xeeeeeeee;words=[]
    for (enc,) in struct.iter_unpack('<I',raw):
        seed=(seed+crypt[0x400+(key&255)])&mask;plain=enc^((key+seed)&mask)
        key=(((~key<<21)+0x11111111)|(key>>11))&mask;seed=(plain+seed+(seed<<5)+3)&mask;words.append(plain)
    return struct.pack('<'+'I'*len(words),*words)
ht=list(struct.iter_unpack('<IIHHI',decrypt(buf[base+hash_off:base+hash_off+nh*16],hashed('(hash table)',3))))
bt=list(struct.iter_unpack('<IIII',decrypt(buf[base+block_off:base+block_off+nb*16],hashed('(block table)',3))))
def lookup(name):
    a,b=hashed(name,1),hashed(name,2)
    out=[]
    for ha,hb,locale,platform,index in ht:
        if (ha,hb)==(a,b) and index<nb:
            pos,compressed,plain,flags=bt[index]
            if flags&0x80000000:out.append({'block':index,'position':pos,'compressed':compressed,'bytes':plain,'flags':flags,'locale':locale,'platform':platform})
    return out
def decompress(raw,expected):
    if len(raw)==expected:return raw
    compression=raw[0];payload=raw[1:]
    if compression==2:payload=zlib.decompress(payload)
    elif compression==16:payload=bz2.decompress(payload)
    else:raise ValueError('unsupported-compression-'+str(compression))
    assert len(payload)==expected
    return payload
def read(name):
    matches=lookup(name)
    if not matches:return None
    assert len(matches)==1
    m=matches[0];flags=m['flags'];start=base+m['position'];raw=buf[start:start+m['compressed']]
    if m['bytes']==0:return b''
    if flags&0x10000:raise ValueError('encrypted-file')
    if flags&0x1000000:return decompress(raw,m['bytes']) if flags&0x200 else raw
    if not flags&0x200:
        assert len(raw)==m['bytes'];return raw
    sector=512<<shift;n=(m['bytes']+sector-1)//sector
    offsets=struct.unpack_from('<'+'I'*(n+1),raw)
    out=b''.join(decompress(raw[offsets[i]:offsets[i+1]],min(sector,m['bytes']-i*sector)) for i in range(n))
    assert len(out)==m['bytes'];return out
def text(b):return b.split(b'\0',1)[0].decode('utf-8',errors='replace')
def model_paths(raw):
    path=raw.replace('/','\\');p=path.lower()
    names=[path]
    if p.endswith('.mdl'):names.append(path[:-4]+'.mdx')
    elif not p.endswith('.mdx'):names.extend([path+'.mdx',path+'.mdl'])
    return list(dict.fromkeys(names))
def decode_mdx(raw):
    if raw[:4]!=b'MDLX':raise ValueError('not-MDLX')
    pos=4;chunks=[];textures=[];sequences=[];v=None
    while pos<len(raw):
        assert pos+8<=len(raw)
        tag=raw[pos:pos+4].decode('ascii');length=struct.unpack_from('<I',raw,pos+4)[0];pos+=8
        assert pos+length<=len(raw),(tag,length,len(raw)-pos)
        c=raw[pos:pos+length];chunks.append({'tag':tag,'bytes':length})
        if tag=='VERS':v=struct.unpack('<I',c)[0]
        elif tag=='TEXS':
            assert length%268==0
            for i in range(0,length,268):
                rid=struct.unpack_from('<I',c,i)[0];name=text(c[i+4:i+264]);flags=struct.unpack_from('<I',c,i+264)[0]
                textures.append({'replaceableId':rid,'path':name,'wrapFlags':flags,'mapMatches':lookup(name) if name else []})
        elif tag=='SEQS':
            assert length%132==0
            for i in range(0,length,132):
                start,end,speed,nonloop=struct.unpack_from('<IIfI',c,i+80)
                sequences.append({'name':text(c[i:i+80]),'start':start,'end':end,'moveSpeed':speed,'nonLooping':bool(nonloop)})
        pos+=length
    return {'version':v,'chunks':chunks,'textures':textures,'sequences':sequences,
      'animationFamilies':sorted(set(s['name'].split(' ')[0].lower() for s in sequences)),
      'namedTextureCount':sum(bool(t['path']) for t in textures),
      'missingNamedTextures':[t['path'] for t in textures if t['path'] and not t['mapMatches']],
      'replaceableIds':sorted(set(t['replaceableId'] for t in textures if t['replaceableId']))}

def decode_mdl(raw):
    body=raw.decode('utf-8-sig')
    version=re.search(r'FormatVersion\s+(\d+)\s*,',body)
    if not version:raise ValueError('not-MDL')
    textures=[];sequences=[]
    for block in re.findall(r'\bBitmap\s*\{([^}]*)\}',body):
        path=re.search(r'\bImage\s+"((?:\\.|[^"\\])*)"',block)
        name=path.group(1).replace('\\\\','\\') if path else ''
        rid=re.search(r'\bReplaceableId\s+(\d+)',block)
        textures.append({'replaceableId':int(rid.group(1)) if rid else 0,'path':name,'mapMatches':lookup(name) if name else []})
    # Only the named animation header and its first Interval are inventoried.
    for match in re.finditer(r'\bAnim\s+"([^"]+)"\s*\{\s*Interval\s*\{\s*(\d+)\s*,\s*(\d+)\s*\}',body):
        sequences.append({'name':match.group(1),'start':int(match.group(2)),'end':int(match.group(3))})
    return {'format':'text-MDL','version':int(version.group(1)),'textures':textures,'sequences':sequences,
      'animationFamilies':sorted(set(s['name'].split(' ')[0].lower() for s in sequences)),
      'namedTextureCount':sum(bool(t['path']) for t in textures),'missingNamedTextures':[t['path'] for t in textures if t['path'] and not t['mapMatches']],
      'replaceableIds':sorted(set(t['replaceableId'] for t in textures if t['replaceableId']))}

towers=json.loads((ROOT/'docs/rules/economy-data.json').read_text())['towers'];ids={t['id'] for t in towers}
ui={r['unitUIID']:r for r in json.loads((ROOT/'reference/map-6.25/units_unitui.json').read_text())}
overrides=json.loads((ROOT/'reference/map-6.25/war3map.w3u.json').read_text())
assert not any(m['key']=='umdl' for o in overrides for m in o['mods'])
refs={id:ui[id]['file'] for id in sorted(ids)};models=[]
for rawname in sorted(set(refs.values())):
    candidates=[{'path':name,'matches':lookup(name)} for name in model_paths(rawname)]
    found=next((c for c in candidates if c['matches']),None)
    entry={'sourcePath':rawname,'towerIds':[id for id,name in refs.items() if name==rawname],'candidates':candidates}
    if found:
        entry['archivePath']=found['path']
        try:
            raw=read(found['path']);binary=raw[:4]==b'MDLX'
            entry.update(sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),mdx=decode_mdx(raw) if binary else decode_mdl(raw),status='mdx-headers-parsed' if binary else 'mdl-headers-parsed')
        except (ValueError,AssertionError,struct.error) as e:entry.update(status='found-needs-decoder',error=str(e))
    else:entry['status']='not-in-map-needs-library-or-approved-substitute'
    models.append(entry)
counts=Counter(m['status'] for m in models)
data={'schemaVersion':1,'scope':'274 workbook tower objects; map-only exact model paths and MDX TEXS/SEQS headers, not full render/dependency closure',
 'sourceMap':{'path':str(MAP),'sha256':digest,'bytes':len(buf),'archiveOffset':base},
 'sourceFiles':[{'path':f,'sha256':hashlib.sha256((ROOT/f).read_bytes()).hexdigest()} for f in ['reference/map-6.25/units_unitui.json','reference/map-6.25/war3map.w3u.json','docs/rules/economy-data.json']],
 'counts':{'towerObjects':len(refs),'distinctModelReferences':len(models),'statuses':dict(counts),'withMissingNamedTextures':sum(bool(m.get('mdx',{}).get('missingNamedTextures')) for m in models)},
 'models':models,'primarySources':['https://github.com/ladislav-zezula/StormLib/blob/master/src/SBaseCommon.cpp','https://github.com/flowtsohg/mdx-m3-viewer/blob/master/src/parsers/mdlx/model.ts','https://github.com/flowtsohg/mdx-m3-viewer/blob/master/src/parsers/mdlx/sequence.ts','https://github.com/flowtsohg/mdx-m3-viewer/blob/master/src/parsers/mdlx/texture.ts'],
 'remaining':['Resolve missing base-game files from available model libraries or user-approved Warcraft-format substitutes.','Read attachments/particle-model references and replaceable texture resolution; named TEXS paths alone are not full closure.','Verify texture decodes, mesh/skeleton/material compatibility and real animation rendering before marking an asset usable.','Audit monsters/workers/effects/projectiles/UI beyond these 274 tower object models.'],'warcraftClientRun':False,'webRendererRun':False}
(ROOT/'docs/rules/model-asset-inventory.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(data['counts'],ensure_ascii=False))
