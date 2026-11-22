# InstaSlice Beta plate solver

Choose **Annotate → Solve → Solver → InstaSlice (Beta)** to run this solver. The Standard option runs the existing solver. Both modes work in the browser with the same annotation and WCS tools.

`solver.js` extracts point sources with a local background estimate and subpixel centroids. It ranks the detections by flux, contrast and spatial distribution, searches for neighbouring four-star fingerprints at several scales and estimates a camera pose. It checks independent star matches across the frame and tests offset projections to estimate the chance of a false match. The result is an equatorial WCS. For wide images, a polynomial distortion fit can be retained when it improves the fit on stars excluded from that fit.

The deep-sky pack has 65,362 catalogue stars selected using 38 public catalogue queries for selected fields in both hemispheres. The bright pack has 50,705 stars across the sky. The narrow-field coverage is regional. Panoramas, strongly distorted photos and small crops outside these fields can be difficult to solve. The upper-sky pass can produce a solution limited to the verified portion of a portrait image.

The supplied photos were used locally to adjust the extraction ranks, search passes and verification thresholds. The generated indexes use public stellar measurements and contain celestial directions and geometric fingerprints. See [data sources and terms](CREDITS.txt).

## Build the indexes

`build_index.py` requires Python 3, NumPy and SciPy. This step is done before deployment. The web app uses the compressed packs alongside the worker.

```sh
python build_index.py regional deep.isq.gz gaia-regions/*.csv
python build_index.py wide wide.isq.gz gaia_merged.bin
```

The regional input is one Gaia DR3 TAP CSV per area. Use these columns in order and restrict the query to the required sky region and magnitude range.

```sql
SELECT source_id, ra, dec, phot_g_mean_mag, pmra, pmdec
FROM gaiadr3.gaia_source
WHERE phot_g_mean_mag <= 14
  AND 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 84.69, -69.10, 2.30))
```

The wide input is the GDR3 version 1 bright-star measurement table described in `CREDITS.txt`. The builder selects stars up to magnitude 7.8. It adjusts catalogue directions using their proper motion and generates the pattern keys independently.

Each gzip file contains an `ISQ1` header with the number of stars and patterns, followed by the three-component star directions in an implicit k-d tree. Sorted 32-bit keys and four 16-bit star indices per pattern follow. Fields use little-endian encoding. `worker.js` fetches the two public packs from fixed same-origin URLs, validates each pack before use and returns a WCS header to the page.
