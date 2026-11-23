"""Build InstaSlice's independent geometric star index from public catalogue rows.

Regional inputs are Gaia TAP CSVs (source_id, ra, dec, phot_g_mean_mag, pmra,
pmdec). The optional bright catalogue is a table of public measurements in
GDR3 format. The output contains directions and quartet fingerprints only.
"""
import argparse
from functools import lru_cache
import gzip
from itertools import combinations
import math
from pathlib import Path
import struct

import numpy as np
from scipy.spatial import cKDTree


GDR3 = np.dtype([('id','<i8'),('ra','<f8'),('dec','<f8'),('mag','<f4'),('pmra','<f4'),('pmdec','<f4')])
QUAD = np.dtype([('key','<u4'),('a','<u2'),('b','<u2'),('c','<u2'),('d','<u2')])
DEG = math.pi / 180


def catalogue(path):
    if path.suffix.lower() == '.csv':
        with path.open() as file:
            columns = file.readline().strip().lower().split(',')
            expected = ['source_id', 'ra', 'dec', 'phot_g_mean_mag', 'pmra', 'pmdec']
            if columns != expected:
                raise ValueError(f'{path} must have columns {", ".join(expected)}')
            data = np.genfromtxt(file, delimiter=',', dtype=GDR3, filling_values=0.0)
    else:
        with path.open('rb') as file:
            magic, version, count = struct.unpack('<4sIQ', file.read(16))
            if (magic, version) != (b'GDR3', 1):
                raise ValueError('Expected a GDR3 star catalogue')
            data = np.fromfile(file, dtype=GDR3, count=count)
    return np.atleast_1d(data)


def directions(data):
    ra, dec = np.radians(data['ra']), np.radians(data['dec'])
    radial = np.column_stack((np.cos(dec)*np.cos(ra), np.cos(dec)*np.sin(ra), np.sin(dec)))
    east = np.column_stack((-np.sin(ra), np.cos(ra), np.zeros(len(ra))))
    north = np.cross(radial, east)
    motion = np.nan_to_num(data['pmra'].astype(float))[:, None]*east + np.nan_to_num(data['pmdec'].astype(float))[:, None]*north
    radial += motion * (-16 * DEG / 3_600_000)
    return radial / np.linalg.norm(radial, axis=1)[:, None]


def in_magnitude_order(data):
    valid = data[np.isfinite(data['mag']) & np.isfinite(data['ra']) & np.isfinite(data['dec'])]
    return valid[np.argsort(valid['mag'], kind='stable')]


@lru_cache(maxsize=40)
def quartets(n):
    return np.array(list(combinations(range(n), 4)), dtype=np.intp)


PAIRINGS = np.array([(a,b,*[q for q in range(4) if q != a and q != b])
                     for a,b in combinations(range(4),2)])


def describe(indices, stars, radius):
    """Canonical four-point coordinates in the tangent plane of the widest pair."""
    points = stars[indices]
    first, second = PAIRINGS[:,:2].T
    distances = np.sum((points[:,first] - points[:,second])**2, axis=2)
    farthest = np.argmax(distances, axis=1)
    longest = np.take_along_axis(distances, farthest[:,None], axis=1)[:,0]
    # Each anchor pair spans a useful part of its sampled aperture.
    valid = (longest >= (2*math.sin(radius*0.26))**2) & (longest <= (2*math.sin(radius*0.99))**2)
    # Near-ties would change the choice of baseline under a subpixel error.
    valid &= np.sum(distances >= 0.986 * longest[:,None], axis=1) == 1
    if not np.any(valid):
        return np.empty(0,dtype=QUAD)
    indices = np.take_along_axis(indices[valid], PAIRINGS[farthest[valid]], axis=1)
    a,b,c,d = stars[indices].transpose((1,0,2))
    x = b-a
    z = a+b
    y = np.cross(z, x)
    baseline = 2 * np.sum(x*x,axis=1)
    height = np.sum(z*z,axis=1)
    def project(s):
        factor = height / (baseline * np.sum(z*s,axis=1))
        return .5 + np.sum(x*s,axis=1)*factor, np.sum(y*s,axis=1)*factor / np.sqrt(height)
    u,v = project(c)
    p,q = project(d)
    reverse = u+p > 1
    u,v = np.where(reverse,1-u,u), np.where(reverse,-v,v)
    p,q = np.where(reverse,1-p,p), np.where(reverse,-q,q)
    indices[reverse,:2] = indices[reverse,:2][:,::-1]
    swap = u > p
    s,t = np.where(swap,p,u), np.where(swap,q,v)
    u,v = np.where(swap,u,p), np.where(swap,v,q)
    indices[swap,2:] = indices[swap,2:][:,::-1]
    mirror = t+v < 0
    t,v = np.where(mirror,-t,t), np.where(mirror,-v,v)
    # Reject ambiguous orientation and almost collinear or redundant points.
    keep = ((1-s-u > .018) & (u-s > .016) & (t+v > .022)
            & (np.maximum(np.abs(t),np.abs(v)) > .115)
            & (s >= .045) & (u <= .955)
            & ((u-s)**2+(v-t)**2 > .035**2))
    quantized = np.floor(np.column_stack((s,t+1,u,v+1))[keep]*32+.5).astype(np.uint32)
    key = (quantized[:,0]<<18) | (quantized[:,1]<<12) | (quantized[:,2]<<6) | quantized[:,3]
    records = np.empty(len(key),dtype=QUAD)
    records['key'] = key
    for col, component in zip(indices[keep].T, 'abcd'):
        records[component] = col
    return records


def tangent_frame(pole):
    east = np.cross([0.,0.,1.], pole)
    if np.linalg.norm(east) < 1e-8:
        east = np.cross([0.,1.,0.], pole)
    east /= np.linalg.norm(east)
    return east, np.cross(pole,east)


def regional_selection(data, cell_size=.14):
    """Limit reference density per sky patch before selecting pattern stars."""
    data = in_magnitude_order(data)
    if len(data) < 14:
        raise ValueError('A small-field catalogue must contain at least 14 valid stars')
    sky = directions(data)
    center = sky.mean(axis=0)
    center /= np.linalg.norm(center)
    east,north = tangent_frame(center)
    xy = np.column_stack((sky@east,sky@north)) / (sky@center)[:,None]
    cells=np.floor(xy/(cell_size*DEG)).astype(int)
    occupancy={}
    keep=[]
    for i, cell in enumerate(map(tuple,cells)):
        count=occupancy.get(cell,0)
        if count >= 7: continue
        occupancy[cell]=count+1
        keep.append(i)
        if len(keep)==1800: break
    return data[keep],center,xy[keep]


def regional_centers(center,xy,radius):
    east,north = tangent_frame(center)
    shift = radius * .88
    limits = np.max(np.abs(xy),axis=0) + .15 * radius
    ring = np.linalg.norm(xy,axis=1).max() + radius*.18
    u,v = np.meshgrid(np.arange(-limits[0],limits[0]+shift,shift),
                      np.arange(-limits[1],limits[1]+shift,shift))
    x,y = u.ravel(),v.ravel()
    keep = x*x+y*y < ring*ring
    grid = center + x[keep,None]*east + y[keep,None]*north
    grid = np.vstack([center,grid])
    return grid/np.linalg.norm(grid,axis=1)[:,None]


def all_sky_centers(radius):
    n = math.ceil(4*math.pi / ((radius*.88)**2))
    samples = np.arange(n) + .5
    height = 1 - 2*samples/n
    angle = 2*math.pi*samples/((1+math.sqrt(5))/2)
    projected = np.sqrt(1-height*height)
    return np.column_stack((projected*np.cos(angle),projected*np.sin(angle),height))


def patterns(stars, groups, levels, depth):
    output=[]
    for name, ids, make_centers in groups:
        tree = cKDTree(stars[ids])
        batch=[]
        for r in levels:
            radius = r*DEG
            for nearby in tree.query_ball_point(make_centers(radius),2*math.sin(radius/2),return_sorted=True):
                if len(nearby)<4: continue
                chosen = ids[np.array(nearby[:depth],dtype=int)]
                result = describe(chosen[quartets(len(chosen))],stars,radius)
                if len(result): batch.append(result)
        if batch:
            packed=np.unique(np.concatenate(batch))
            output.append(packed)
            print(name, len(ids), len(packed),flush=True)
    if not output:
        raise ValueError('Failed to build any quad patterns')
    return np.unique(np.concatenate(output))


def kd_order(stars):
    """Implicit balanced k-d tree in which subtrees are contiguous array slices."""
    order = np.arange(len(stars), dtype=int)
    def visit(start, end, axis):
        if end-start <= 1:
            return
        half = (end-start)//2
        part = order[start:end]
        order[start:end] = part[np.argpartition(stars[part,axis],half)]
        middle = start + half
        visit(start,middle,(axis+1)%3)
        visit(middle+1,end,(axis+1)%3)
    visit(0,len(stars),0)
    return order


def write_index(path, sky, rows):
    if not len(sky) <= 65535:
        raise ValueError('Split star packs exceeding 65,535 stars')
    order = kd_order(sky)
    inverse = np.empty(len(sky), dtype=np.uint16)
    inverse[order] = np.arange(len(sky), dtype=np.uint16)
    for index in 'abcd':
        rows[index] = inverse[rows[index]]
    with path.open('wb') as output, gzip.GzipFile(fileobj=output, filename='', mode='wb', mtime=0, compresslevel=6) as stream:
        stream.write(struct.pack('<4sIII',b'ISQ1',len(sky),len(rows),0))
        stream.write(np.ascontiguousarray(sky[order],dtype='<f4').tobytes())
        stream.write(np.ascontiguousarray(rows['key'],dtype='<u4').tobytes())
        stream.write(np.ascontiguousarray(np.stack([rows[k] for k in 'abcd'],axis=1),dtype='<u2').tobytes())
    print(f'{path.name}: {len(sky):,} stars, {len(rows):,} quads, {path.stat().st_size/1048576:.1f} MiB',flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=('regional','wide'))
    parser.add_argument('output',type=Path)
    parser.add_argument('sources',type=Path,nargs='+')
    parser.add_argument('--levels',type=float,nargs='+')
    parser.add_argument('--depth',type=int)
    parser.add_argument('--cell-size',type=float,default=.14,help='Regional sampling cell size in degrees')
    args=parser.parse_args()
    if args.cell_size <= 0:
        parser.error('--cell-size must be positive')
    if args.mode=='wide':
        data=in_magnitude_order(catalogue(args.sources[0]))
        data=data[data['mag']<=7.8]
        sky=directions(data)
        rows=patterns(sky,[('All sky',np.arange(len(sky)),all_sky_centers)],
                      args.levels or [3.6,5.7,9,14,22.5,35,51],args.depth or 12)
    else:
        by_id={}
        chosen=[]
        for path in args.sources:
            data,center,xy=regional_selection(catalogue(path), args.cell_size)
            if len(data)<14: continue
            for entry in data:
                by_id.setdefault(int(entry['id']),entry)
            chosen.append((path.stem,data,center,xy))
        data=np.array(sorted(by_id.values(),key=lambda row:(row['mag'],row['id'])),dtype=GDR3)
        indices={row['id']:i for i,row in enumerate(data)}
        sky=directions(data)
        groups=[]
        for name, field, pole, xy in chosen:
            ids=np.sort(np.array([indices[row['id']] for row in field]))
            groups.append((name,ids,lambda r,p=pole,a=xy:regional_centers(p,a,r)))
        rows=patterns(sky,groups,args.levels or [.34,.58,1.02,1.82,3.05],args.depth or 13)
    write_index(args.output,sky,rows)


if __name__=='__main__':
    main()
