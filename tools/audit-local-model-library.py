#!/usr/bin/env python3
"""Validate local catalog files and model headers without running a renderer."""
import hashlib
import importlib.util
import json
from collections import Counter,defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LIB=Path('/Users/laihanbin/Downloads/环界模型库')
spec=importlib.util.spec_from_file_location('asset_audit',ROOT/'tools/audit-model-assets.py')
asset=importlib.util.module_from_spec(spec);spec.loader.exec_module(asset)
asset.lookup=lambda name:[] # The library uses each package's explicit texture mapping.
catalog=json.loads((LIB/'catalog.json').read_text())
cache={}
def checked(name):
    if name in cache:return cache[name]
    p=(LIB/'assets'/name).resolve()
    assert p.is_relative_to((LIB/'assets').resolve())
    if not p.is_file():result={'asset':name,'exists':False}
    else:
        raw=p.read_bytes();sha=hashlib.sha256(raw).hexdigest()
        result={'asset':name,'exists':True,'bytes':len(raw),'sha256':sha,'matchesContentName':p.stem==sha}
    cache[name]=result;return result
def norm(s):return s.replace('/','\\').casefold()
models=[];path_index=defaultdict(set)
for entry in catalog['models']:
    result={k:entry.get(k) for k in ['id','name','source','group','asset','format']}
    model=checked(entry['asset']);result['file']=model
    mappings={norm(k):v for k,v in entry.get('textures',{}).items()}
    for path,name in mappings.items():
        chk=checked(name)
        if chk['exists'] and chk['matchesContentName']:path_index[path].add(name)
    try:
        if not model['exists']:raise ValueError('missing-model')
        if entry['format'] not in ['mdx','mdl']:raise ValueError('outside-Warcraft-model-formats')
        raw=(LIB/'assets'/entry['asset']).read_bytes()
        parsed=asset.decode_mdx(raw) if raw[:4]==b'MDLX' else asset.decode_mdl(raw)
        result.update(version=parsed['version'],animationFamilies=parsed['animationFamilies'],animations=[s['name'] for s in parsed['sequences']],replaceableIds=parsed['replaceableIds'])
        result['geometryHeaderPresent']=any(c['tag']=='GEOS' and c['bytes']>0 for c in parsed.get('chunks',[])) if 'chunks'in parsed else entry.get('geometry',False)
        result['textureReferences']=[]
        for t in parsed['textures']:
            if not t['path']:continue
            name=mappings.get(norm(t['path']))
            result['textureReferences'].append({'path':t['path'],'asset':name,'resolved':bool(name and checked(name)['exists'] and checked(name)['matchesContentName'])})
        result['missingNamedTextures']=[t['path'] for t in result['textureReferences'] if not t['resolved']]
        result['status']='headers-and-named-textures-resolved' if not result['missingNamedTextures'] else 'headers-parsed-missing-textures'
        result['combatAnimationCandidate']=result['geometryHeaderPresent'] and all(any(a.lower().startswith(tag) for a in result['animations']) for tag in ['stand','attack','death']) and not result['missingNamedTextures'] and model['matchesContentName']
    except (ValueError,AssertionError,UnicodeError) as e:result.update(status='needs-review',error=str(e),combatAnimationCandidate=False)
    models.append(result)
original=json.loads((ROOT/'docs/rules/model-asset-inventory.json').read_text())
missing=sorted({norm(t) for m in original['models'] for t in m.get('mdx',{}).get('missingNamedTextures',[])})
cross=[{'path':p,'exactPathLibraryCandidates':sorted(path_index.get(p,[]))} for p in missing]
data={'schemaVersion':1,'scope':'existing local catalog files, hash identity, model headers and package texture bindings; no full decode/render or final per-tower substitute selection',
 'catalog':{'path':str(LIB/'catalog.json'),'sha256':hashlib.sha256((LIB/'catalog.json').read_bytes()).hexdigest()},
 'counts':{'catalogEntries':len(models),'statuses':dict(Counter(m['status'] for m in models)),'combatAnimationCandidates':sum(m['combatAnimationCandidate'] for m in models),'uniqueFilesChecked':len(cache),'missingFiles':sum(not v['exists'] for v in cache.values()),'hashMismatches':sum(v['exists'] and not v['matchesContentName'] for v in cache.values()),'mapMissingNamedTexturePaths':len(missing),'exactPathLibraryCoverage':sum(bool(r['exactPathLibraryCandidates']) for r in cross)},
 'models':models,'files':list(cache.values()),'mapTextureCrossReference':cross,
 'remaining':['Validate BLP/image decode, geometry/skeleton/material render and animation playback.','Resolve external attachment/particle/replaceable textures.','Choose and visually check per-tower Warcraft-format substitutes under existing user authorization.'],'gameRendererRun':False}
(ROOT/'docs/rules/local-model-library.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(data['counts'],ensure_ascii=False))
