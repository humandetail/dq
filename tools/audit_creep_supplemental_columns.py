#!/usr/bin/env python3
"""Append/check J-and-later evidence without changing existing rule decisions."""
import argparse,hashlib,json,re,zipfile
from pathlib import Path
import xml.etree.ElementTree as E
ROOT=Path(__file__).resolve().parents[1];N={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
FILES=['creep-skill-family-001-053','creep-skill-family-next','creep-buffs-orbs-and-immolation']
def colnum(s):
 n=0
 for c in s:n=n*26+ord(c)-64
 return n
def read_sheet():
 with zipfile.ZipFile(ROOT/'图鉴.xlsx')as z:
  ss=[''.join(x.itertext())for x in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',N)];out={}
  for c in E.fromstring(z.read('xl/worksheets/sheet5.xml')).findall('.//s:c',N):
   v=c.find('s:v',N);s=v.text if v is not None else '';s=ss[int(s)]if c.get('t')=='s'else ''.join(c.find('s:is',N).itertext())if c.get('t')=='inlineStr'else s;out[c.get('r')]=s or ''
  return out
W=read_sheet();COLS=sorted({re.match('[A-Z]+',k)[0]for k in W},key=colnum);EXTRA=[c for c in COLS if colnum(c)>9]
def audit(d):
 rows=sorted({w['row']for x in d['ids']for w in x['workbook']});records=[{'row':r,'id':W.get('F'+str(r)), 'cells':{c+str(r):W.get(c+str(r),'')for c in EXTRA},'xmlCellPresent':{c+str(r):c+str(r)in W for c in EXTRA}}for r in rows];nonempty=[{'row':r['row'],'cell':c,'value':v}for r in records for c,v in r['cells'].items()if v]
 assert not nonempty,'New supplemental content requires human source reconciliation, not an automatic empty/default choice'
 return {'sheet':'塔技能','source':'图鉴.xlsx/xl/worksheets/sheet5.xml','workbookSha256':hashlib.sha256((ROOT/'图鉴.xlsx').read_bytes()).hexdigest(),'actualColumns':COLS,'extraColumns':EXTRA,'headersRow4':{c+'4':W.get(c+'4','')for c in EXTRA},'rows':records,'rowCount':len(records),'extraCellCount':len(records)*len(EXTRA),'nonemptySupplementalCells':nonempty,'assessment':'All J cells in this scoped batch are explicitly empty; no supplemental numeric conflict and no rule changes. Empty is not zero. This does not establish other IDs or future columns as empty.'}
def compact(d):
 s=json.dumps(d,ensure_ascii=False,indent=2);return re.sub(r'("fields": )(\{\n.*?\n\s*\})',lambda m:m.group(1)+json.dumps(json.loads(m.group(2)),ensure_ascii=False,separators=(',',':')),s,flags=re.S)+'\n'
if __name__=='__main__':
 a=argparse.ArgumentParser();g=a.add_mutually_exclusive_group(required=True);g.add_argument('--write',action='store_true');g.add_argument('--check',action='store_true');args=a.parse_args()
 for name in FILES:
  p=ROOT/'docs/rules'/f'{name}.json';d=json.loads(p.read_text());e=audit(d)
  if args.write:d['workbookSupplementalAudit']=e;p.write_text(compact(d))
  else:assert d.get('workbookSupplementalAudit')==e,name
  print(name, e['rowCount'],e['extraCellCount'],'nonempty',len(e['nonemptySupplementalCells']))
