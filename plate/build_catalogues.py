"""Build separate Stellarium DSO and HYG star-label assets from pinned source data."""
import argparse
import csv
import json
import re
from pathlib import Path

PREFIXES = (
    'NGC', 'IC', 'M', 'C', 'B', 'Sh 2-', 'vdB', 'RCW', 'LDN', 'LBN',
    'Cr', 'Mel', 'PGC', 'UGC', 'Ced', 'Arp', 'VV', 'PK', 'PN G',
    'SNR G', 'Abell', 'HCG', 'ESO', 'vdBH', 'DWB', 'Tr', 'St', 'Ru', 'vdB-Ha'
)
PREFERRED = ('M', 'NGC', 'IC', 'C', 'B', 'Sh 2-', 'vdB', 'RCW', 'LDN', 'LBN',
             'PN G', 'SNR G', 'Tr', 'Mel', 'Cr', 'ESO', 'PGC')
GREEK = dict(zip(
    ('Alp','Bet','Gam','Del','Eps','Zet','Eta','The','Iot','Kap','Lam','Mu','Nu','Xi',
     'Omi','Pi','Rho','Sig','Tau','Ups','Phi','Chi','Psi','Ome'),
    'αβγδεζηθικλμνξοπρστυφχψω',
))
SUPERSCRIPTS = str.maketrans('0123456789', '⁰¹²³⁴⁵⁶⁷⁸⁹')
STELLARIUM_REVISION = 'e4a447eb504b3a731a2c7cf32292b0263d062d63'

def identifier(prefix, value):
    return f'{prefix}{value}' if prefix.endswith('-') else f'{prefix} {value}'

def descriptions(path):
    names = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        match = re.search(r'_"?\(?"([^"\n]+)"\)?\s*#\s*WK(?:\b|,)', line[20:])
        if not match:
            continue
        names.setdefault((line[:5].strip().upper(), line[5:20].strip()), match.group(1))
    return names

def magnitude(value):
    try:
        number = float(value)
    except ValueError:
        return None
    return round(number, 3) if -30 < number < 30 else None

def stellarium(catalogue, names_file):
    names = descriptions(names_file)
    rows = []
    for line in catalogue.read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        columns = [value.strip() for value in line.split('\t')]
        if len(columns) < 45:
            continue
        ra, dec = map(float, columns[1:3])
        if not (0 <= ra <= 360 and -90 <= dec <= 90):
            continue
        kind = columns[5].upper()
        if kind in ('?', 'REG', ''):
            continue
        ids = {key: value for key, value in zip(PREFIXES, columns[16:45]) if value not in ('0', '')}
        if not ids:
            continue
        key = next((prefix for prefix in PREFERRED if prefix in ids), next(iter(ids)))
        primary = identifier(key, ids[key])
        aliases = [identifier(prefix, value) for prefix, value in ids.items() if prefix != key]
        name = next((names[(prefix.upper(), value)] for prefix, value in ids.items()
                     if (prefix.upper(), value) in names), '')
        if primary == 'IC 1396':
            # The source uses “Elephant’s Trunk” as a common name on the umbrella
            # IC entry. Preserve the cluster ID and name the inner globule separately.
            name = 'Trumpler 37'
            aliases = [alias for alias in aliases if alias != 'Sh 2-131']
        mag = magnitude(columns[4])
        if kind not in ('DN', 'MOC', 'ISM') and mag is None:
            mag = magnitude(columns[3])
        if kind in ('DN', 'MOC', 'ISM'):
            mag = None  # many dark clouds have opacity classes in magnitude fields
        size = float(columns[7] or 0)
        major = round(size, 3) if 0 < size <= 1800 else None
        rows.append([primary, name, 'ST:'+kind, round(ra % 360, 7), round(dec, 7), mag, major, aliases])
    return rows

def bayer_name(bayer, constellation):
    letter = bayer[:3].title()
    if letter not in GREEK or not constellation:
        return f'{bayer} {constellation}'.strip() if bayer else ''
    return f'{GREEK[letter]}{bayer[3:].translate(SUPERSCRIPTS)} {constellation}'

def hyg(catalogue):
    rows = []
    with catalogue.open(encoding='utf-8', newline='') as file:
        for row in csv.DictReader(file):
            mag = magnitude(row['mag'])
            proper = row['proper'].strip()
            if row['id'] == '0' or mag is None or (mag > 8.5 and not proper):
                continue
            hip, hd, hr, gliese = (row[key].strip() for key in ('hip','hd','hr','gl'))
            constellation = row['con'].strip()
            bayer = bayer_name(row['bayer'].strip(), constellation)
            flam = f"{row['flam']} {constellation}" if row['flam'] and constellation else ''
            aliases = [name for name in (bayer, flam, f'HD {hd}' if hd else '',
                        f'HR {hr}' if hr else '', f'Gl {gliese}' if gliese else '') if name]
            primary = f'HIP {hip}' if hip else f'HD {hd}' if hd else f'HYG {row["id"]}'
            title = proper or bayer or flam or (f'HD {hd}' if hd else '')
            aliases = list(dict.fromkeys(alias for alias in aliases if alias != primary))
            ra, dec = float(row['ra'])*15, float(row['dec'])
            if not (0 <= ra <= 360 and -90 <= dec <= 90):
                continue
            rows.append([primary,title,'*',round(ra % 360,7),round(dec,7),mag,None,aliases])
    rows.sort(key=lambda star: star[5])
    return rows

def write(path, source, license_name, rows):
    path.write_text(json.dumps({
        'version': 2, 'source': source, 'license': license_name, 'objects': rows
    }, ensure_ascii=False, separators=(',',':'))+'\n', encoding='utf-8')
    print(f'{path.name}: {len(rows):,} objects, {path.stat().st_size:,} bytes')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('stellarium', type=Path)
    parser.add_argument('names', type=Path)
    parser.add_argument('hyg', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    write(args.output/'stellarium-dso.json','Stellarium standard DSO 3.23 '+STELLARIUM_REVISION,
          'GPL-2.0-or-later',stellarium(args.stellarium,args.names))
    write(args.output/'stellar-labels.json','HYG v4.1, David Nash / Astronomy Nexus',
          'CC-BY-SA-4.0',hyg(args.hyg))
