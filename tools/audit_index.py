#!/usr/bin/env python3
"""Local source lookups for the 6.25 rules audit."""
import argparse
from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import runpy
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / 'reference/map-6.25'
DISASM = 'reference/map-6.25/main.disasm'
WORKBOOKS = (Path('/Users/laihanbin/Downloads/刀圈TD 6.25 图鉴.xlsx'), ROOT / '图鉴.xlsx')
CACHE = ROOT / '.audit-cache/source-index.sqlite'
PARSER = ROOT / 'tools/audit-weapon-fields.py'
RAW_ID = re.compile(r'(?<![A-Za-z0-9_])[A-Za-z][A-Za-z0-9_]{3}(?![A-Za-z0-9_])')
VERSION = 1


def source_path(path):
    return str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)


def encode(value):
    return json.dumps(value, ensure_ascii=False, default=str, separators=(',', ':'))


def read_cache():
    return sqlite3.connect(f'{CACHE.as_uri()}?mode=ro', uri=True)


def populate(db, sources, fingerprints):
    from openpyxl import load_workbook

    db.executescript("""
        CREATE TABLE metadata (fingerprint TEXT);
        CREATE TABLE sheet_row (source TEXT, sheet TEXT, row_no INTEGER, cells TEXT,
                                PRIMARY KEY (source, sheet, row_no));
        CREATE TABLE sheet_id (id TEXT, source TEXT, sheet TEXT, row_no INTEGER, col INTEGER);
        CREATE INDEX sheet_lookup ON sheet_id(id);
        CREATE TABLE object_row (source TEXT, row_no INTEGER, object_id TEXT, fields TEXT,
                                 PRIMARY KEY (source, row_no));
        CREATE INDEX object_lookup ON object_row(object_id);
        CREATE TABLE object_alias (alias TEXT, source TEXT, row_no INTEGER, field TEXT);
        CREATE INDEX alias_lookup ON object_alias(alias);
        CREATE TABLE function (name TEXT PRIMARY KEY, start_line INTEGER, end_line INTEGER,
                               labels TEXT, upvalues TEXT);
        CREATE TABLE constant (function TEXT, key TEXT, value TEXT, line INTEGER,
                               PRIMARY KEY (function, key));
        CREATE INDEX literal_lookup ON constant(value);
        CREATE TABLE instruction (function TEXT, pc INTEGER, line INTEGER, op TEXT, args TEXT,
                                  PRIMARY KEY (function, pc));
        CREATE TABLE constant_use (function TEXT, key TEXT, pc INTEGER);
        CREATE INDEX constant_use_lookup ON constant_use(function,key);
    """)
    db.execute('INSERT INTO metadata VALUES (?)', (fingerprints,))
    for path in WORKBOOKS:
        source = source_path(path)
        with closing(load_workbook(path, read_only=True, data_only=True)) as workbook:
            for sheet in workbook:
                for number, cells in enumerate(sheet.values, 1):
                    if not any(cell is not None for cell in cells):
                        continue
                    db.execute('INSERT INTO sheet_row VALUES (?,?,?,?)', (source, sheet.title, number, encode(cells)))
                    for col, cell in enumerate(cells, 1):
                        if isinstance(cell, str):
                            db.executemany('INSERT INTO sheet_id VALUES (?,?,?,?,?)', (
                                (identifier, source, sheet.title, number, col) for identifier in set(RAW_ID.findall(cell))
                            ))
    for path in sources:
        source = source_path(path)
        for number, record in enumerate(json.loads(path.read_text()), 1):
            primary = next(iter(record.values()))
            effective = (record['new'].strip('\0') or primary) if 'new' in record else primary
            db.execute('INSERT INTO object_row VALUES (?,?,?,?)', (source, number, effective, encode(record)))
            for field in ('old', 'new', 'code'):
                alias = record.get(field)
                if isinstance(alias, str) and alias.strip('\0'):
                    db.execute('INSERT INTO object_alias VALUES (?,?,?,?)', (alias, source, number, field))
    lines, functions = runpy.run_path(str(PARSER))['parse']()
    for name, function in functions.items():
        start, end = function['lines']
        db.execute('INSERT INTO function VALUES (?,?,?,?,?)', (name, start, end, encode(function['labels']), encode(function['upvalues'])))
        for line_no in range(start, end + 1):
            line = lines[line_no - 1].strip()
            if line.startswith('.constant'):
                key = line.split(None, 2)[1]
                db.execute('INSERT INTO constant VALUES (?,?,?,?)', (name, key, encode(function['constants'][key]), line_no))
        for item in function['instructions']:
            pc, args = item['pc'], item['args']
            db.execute('INSERT INTO instruction VALUES (?,?,?,?,?)', (name, pc, item['line'], item['op'], encode(args)))
            db.executemany('INSERT INTO constant_use VALUES (?,?,?)', (
                (name, key, pc) for key in set(args) & function['constants'].keys()
            ))


def connect():
    sources = sorted(p for p in MAP.glob('*.json') if p.name != 'manifest.json')
    watched = (*WORKBOOKS, *sources, ROOT / DISASM, PARSER)
    fingerprints = encode([VERSION, [ (source_path(p), hashlib.sha256(p.read_bytes()).hexdigest()) for p in watched ]])
    if CACHE.exists():
        with closing(read_cache()) as db:
            try:
                if db.execute('SELECT fingerprint FROM metadata').fetchone() == (fingerprints,):
                    return read_cache()
            except sqlite3.DatabaseError:
                pass
    CACHE.parent.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=CACHE.parent, delete=False) as tmp:
        temporary = Path(tmp.name)
    try:
        with closing(sqlite3.connect(temporary)) as db, db:
            populate(db, sources, fingerprints)
        temporary.replace(CACHE)
    finally:
        temporary.unlink(missing_ok=True)
    return read_cache()


def workbook_rows(db, identifier, sheet=None):
    sql = '''SELECT s.source,s.sheet,s.row_no,s.cells,group_concat(i.col)
             FROM sheet_id i JOIN sheet_row s USING (source,sheet,row_no)
             WHERE i.id=? AND (? IS NULL OR s.sheet=?)
             GROUP BY s.source,s.sheet,s.row_no ORDER BY s.source,s.sheet,s.row_no'''
    return [{'sourcePath': source, 'sheet': title, 'row': number, 'columns': sorted(map(int, cols.split(','))), 'cells': json.loads(cells)}
            for source, title, number, cells, cols in db.execute(sql, (identifier, sheet, sheet))]


def objects(db, identifier, table=None, aliases=False, fields=None):
    sql = '''SELECT o.source,o.row_no,o.object_id,o.fields FROM object_row o
             WHERE (%s) AND (? IS NULL OR o.source=?) ORDER BY o.source,o.row_no'''
    match = 'o.object_id=?'
    params = [identifier]
    if aliases:
        match += ' OR (o.source,o.row_no) IN (SELECT source,row_no FROM object_alias WHERE alias=?)'
        params.append(identifier)
    path = f'reference/map-6.25/{table.removesuffix(".json")}.json' if table else None
    result = []
    for source, number, object_id, payload in db.execute(sql % match, (*params, path, path)):
        record = json.loads(payload)
        if fields:
            record = {key: record[key] for key in fields if key in record}
        result.append({'sourcePath': source, 'jsonIndex': number - 1, 'id': object_id, 'fields': record})
    return result


def references(db, literal):
    sql = '''SELECT c.function,c.key,c.line,u.pc,i.line,i.op,i.args FROM constant c
             LEFT JOIN constant_use u USING (function,key)
             LEFT JOIN instruction i USING (function,pc)
             WHERE c.value=? ORDER BY c.line,u.pc'''
    return [{'sourcePath': DISASM, 'function': function, 'key': key, 'constantLine': line, 'pc': pc, 'sourceLine': iline,
             'instruction': ' '.join([op, *json.loads(args)]) if op else None}
            for function, key, line, pc, iline, op, args in db.execute(sql, (encode(literal),))]


def instructions(db, function, start, end=None):
    end = start if end is None else end
    rows = db.execute('SELECT pc,line,op,args FROM instruction WHERE function=? AND pc BETWEEN ? AND ? ORDER BY pc',
                      (function, start, end))
    constants = {key: (json.loads(value), line) for key, value, line in db.execute(
        'SELECT key,value,line FROM constant WHERE function=?', (function,))}
    metadata = db.execute('SELECT labels FROM function WHERE name=?', (function,)).fetchone()
    labels = json.loads(metadata[0]) if metadata else {}
    result = []
    for pc, line, op, args in rows:
        operands = json.loads(args)
        result.append({'sourcePath': DISASM, 'function': function, 'pc': pc, 'sourceLine': line, 'op': op, 'args': operands,
                       'constants': {key: {'value': constants[key][0], 'sourceLine': constants[key][1]}
                                     for key in operands if key in constants},
                       'jumpTargets': {label: labels[label] for label in operands if label in labels}})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='query', required=True)
    skill = sub.add_parser('skill')
    skill.add_argument('id')
    obj = sub.add_parser('object')
    obj.add_argument('table')
    obj.add_argument('id')
    obj.add_argument('--aliases', action='store_true')
    obj.add_argument('--fields', nargs='+')
    fn = sub.add_parser('function')
    fn.add_argument('name')
    fn.add_argument('start', type=int)
    fn.add_argument('end', type=int, nargs='?')
    ref = sub.add_parser('literal')
    ref.add_argument('value')
    sub.add_parser('build')
    args = parser.parse_args()
    with closing(connect()) as db:
        if args.query == 'skill':
            result = {'rows': workbook_rows(db, args.id, '塔技能'), 'references': references(db, args.id)}
        elif args.query == 'object':
            result = objects(db, args.id, args.table, args.aliases, args.fields)
        elif args.query == 'function':
            result = instructions(db, args.name, args.start, args.end)
        elif args.query == 'literal':
            result = references(db, args.value)
        else:
            result = {'cache': str(CACHE)}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
