# InstaSlice plate solver

InstaSlice Studio solves starfields with this solver only. It runs in the browser: choose **Annotate → Solve → Identify targets**. Imported WCS files are also supported.

`solver.js` extracts point sources with a local background estimate and subpixel centroids. It ranks the detections by flux, contrast and spatial distribution, searches for neighbouring four-star fingerprints at several scales and estimates a camera pose. It checks independent star matches across the frame and tests offset projections to estimate the chance of a false match. The result is an equatorial WCS. For wide images, a polynomial distortion fit can be retained when it improves the fit on stars excluded from that fit. For fields of 20 degrees or more, a second pass pairs the saturated stars of the picture with the bright-star catalogue of the page and refits projection and distortion together; it replaces the first solution only when it matches clearly more bright stars.

The method belongs to the family of published geometric-hashing solvers: a four-star pattern is described in a frame set by its two most distant stars and looked up in a sorted index (for the published idea see Lang, Hogg, Mierle, Blanton and Roweis 2010, Astronomical Journal 139, 1782). This implementation is self-contained: its `ISQ1` index format, scale search, verification stages and chance-match test are specific to InstaSlice, and the app ships no third-party solver code or index.

Wide-field searches use three overlapping scale bands, because the fingerprint changes little with the assumed focal length. Frames with few stars use a stricter evidence test that compares the matches with those of twenty-four deliberately offset projections.

The sky indexes use public catalogue data. The bright pack has 50,705 stars to magnitude 7.8 across the whole sky, for fields from about 10 to 100 degrees. The mid-depth pack has 341,627 stars to G = 9.65 across the whole sky and serves fields of roughly 1.5 to 16 degrees anywhere. The narrow-field pack holds the same stars in sampling circles of 0.7 degrees and serves fields of about 0.5 to 2.5 degrees anywhere, including the nebulae that have no deep-sky region; it is opened only when the other packs have not solved the frame. The deep-sky pack has 65,362 catalogue stars selected using public catalogue queries for 30 fields in both hemispheres (see [CREDITS.txt](CREDITS.txt)). A fifth, optional pack (`regions.isq.gz`, 36,485 Gaia DR3 stars to G = 15, at most 4,000 per region) holds fields added later, so far 11: the Small Magellanic Cloud, the Virgo galaxies, Leo I, the Whale and Needle galaxies, M106 and M94, M63, M64, the Helix Nebula, NGC 253, NGC 1333 and NGC 7331 with Stephan's Quintet (the centres and radii are in [CREDITS.txt](CREDITS.txt)); a deep-sky pack holds at most 65,535 stars. It is searched right after the deep-sky pack, only when that finds nothing. Strongly distorted photos and small crops of faint fields outside the deep-sky regions can still be difficult to solve, because only stars brighter than G = 9.65 are available there; panoramas and fisheye frames have their own pass (below). The Andromeda close-up pack (`closeups.isq.gz`) samples stars within 1.1° of the core. For a tall frame that only solves near the top, the solver uses detections in overlapping areas to refine the camera map. It expands the annotated area when the lower star matches support the fit.

## Fast search

The search is iterative: every index is tried with the brightest few stars of the picture first (ten), then fourteen, then more, and each deeper pass only visits the quads the shallower pass had not tried. A picture with a clear match among its brightest stars is solved in tens of milliseconds whichever index holds the answer; only a hard picture pays for the long search. The worker keeps its indexes open between pictures, and the page asks it to open them in the background as soon as the Annotate section is shown, so pressing Identify starts the search at once. The fields cut from an ultra-wide frame skip the small-field indexes, which cannot contain them.

## Procedural index

The bright, mid-depth and narrow-field packs are not tables of patterns. It stores the star directions and, for each pattern scale, the short list of stars that belong to each sampling circle (the brightest few in the circle). When the pack is opened, `solver.js` generates the pattern table itself in about a second, with the same fingerprint function that reads the photograph, and sorts it for lookup. The mid-depth file is about a fifth of the size of the stored table it replaces (the bright file, a fiftieth), and a deeper star list costs only its stars: this is the way to add fainter stars without making the site heavy. Generation is lazy and the result lives in the worker's memory only.

The supplied photos were used locally to adjust the extraction ranks, search passes and verification thresholds. The generated indexes use public stellar measurements and contain celestial directions and geometric fingerprints. See [data sources and terms](CREDITS.txt).

## Ultra-wide frames (panoramas and fisheye)

One TAN header cannot describe a panorama or a fisheye frame. The app selects it automatically. A likely panorama gets a short ordinary search before the wide-frame pass. `panorama.js` finds the part of the frame that holds stars, cuts five fields from it (the centre and the four corners) and solves each field with the ordinary solver. Every star matched in a solved field gives a pair: its position in the frame and its direction in the sky.

A levelled panorama (equirectangular or a cylinder seen in perspective, such as an alt-azimuth mosaic) is not a scaled copy of the sky: a degree of longitude is only cos(altitude) of a degree long, so a crop high above the horizon is stretched sideways by an amount that changes across the crop, and the similarity-invariant fingerprints of the engine cannot match it. When a ground line is found, the horizon is taken as the equator of the cylinder, a field just above it (almost undistorted) is solved first and gives the scale, and the other fields are drawn again as the tangent plane of the sky at their centre before they are solved. Their stars are then put back at their true pixel positions in the frame. Neither the horizon row nor the scale has to be exact. Lights on the ground are not read as stars: the star list is taken from the sky above the ground line. A ground line that does not belong to a cylinder (the fields do not solve that way) only costs some time: the fields are then solved as they are.

`projection.js` models the frame as a rotation of the sky into the camera followed by a map projection: equirectangular, central cylindrical, Mercator, cylindrical equal-area, cylindrical stereographic, rectilinear, stereographic, equidistant, equisolid or orthographic, or a fitted one-parameter family between them. The fit starts from closed-form seeds over up to about 1,400 candidate axes and is refined by Levenberg-Marquardt with a Tukey biweight loss, so stars matched on foreground glow do not pull the result. The projection is chosen by how many of the stars detected anywhere in the frame land on catalogue stars, compared with the same count for shifted positions. The fit gives the pointing, the angular extent, the sampling in arc seconds per pixel (centre, minimum and maximum) and the roll of the frame.

The solver tests a bounded image-plane correction on independent stars for frames with modest stitching or resampling. If the solved fields still disagree on one projection, a partial solve shows annotations inside the regions where local matches verified the mapping. Strong fisheye lenses can still prevent a match.

## Build the indexes

`build_index.py` and `build_procedural.py` require Python 3, NumPy and SciPy. This step is done before deployment. The web app uses the compressed packs alongside the worker.

```sh
python build_index.py regional deep.isq.gz gaia-regions/*.csv
python build_procedural.py wide.isp.gz all_sky_stars.npz --max-mag 7.8 --levels 3.6 5.7 9 14 22.5 35 51 --depth 12
python build_procedural.py mid.isp.gz all_sky_stars.npz --max-mag 9.65 --levels 1.45 2.3 3.7 5.9 --depth 8
python build_procedural.py fine.isp.gz all_sky_stars.npz --max-mag 9.65 --levels 0.7 --depth 7
```

The regional input is one Gaia DR3 TAP CSV per area. Use these columns in order and restrict the query to the required sky region and magnitude range.

```sql
SELECT source_id, ra, dec, phot_g_mean_mag, pmra, pmdec
FROM gaiadr3.gaia_source
WHERE phot_g_mean_mag <= 14
  AND 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 84.69, -69.10, 2.30))
```

The all-sky input is a table of catalogue stars (source number, right ascension, declination, G magnitude) from the public measurement tables described in `CREDITS.txt`; the bright pack uses the stars to magnitude 7.8 and the mid-depth and narrow-field packs those to 9.65. `build_index.py wide` still builds the same bright pack as a stored table (`ISQ1`) from a GDR3 measurement file, with proper motion applied.

Each `ISQ1` gzip file contains a header with the number of stars and patterns, followed by the three-component star directions in an implicit k-d tree. Sorted 32-bit keys and four 16-bit star indices per pattern follow. An `ISQP` file has a 20-byte header (magic, number of stars, number of levels), the star directions in the same k-d order, a table of levels (radius in degrees, stars per circle, number of circles) and, for each level, the 32-bit star numbers of every circle. Fields use little-endian encoding. `worker.js` fetches the public packs from fixed same-origin URLs, validates each pack before use and returns a WCS header to the page.

## Limits of the beta solver

- A solution needs at least 15 matching catalogue stars (12 of them independent) and a dozen clear, point-like stars in the picture; at most the 520 brightest detected stars are used.
- The picture is solved at up to 1800 px on its long edge (a second try at up to 2400 px for borderline frames); a try stops after 12 s (8 s for the second).
- Fields of view: bright pack about 10 to 100 degrees, mid-depth pack about 1.5 to 16, narrow-field pack about 0.5 to 2.5, deep-sky and added regions about 0.3 to 3 (inside those regions only; frames narrower than about 1 degree solve only some of the time).
- Outside the 41 deep-sky regions only stars to G = 9.65 are stored (bright pack: magnitude 7.8). Estimated from star counts, not from test solves, a 3:2 frame outside the regions holds the 15 stars needed on about 99% of the sky at 3 degrees wide, 66% at 2 degrees (98% within 10 degrees of the Milky Way plane, 92% from 10 to 30, 47% from 30 to 60, 14% beyond 60), 31% at 1.5 degrees and 5% at 1 degree; narrower frames only inside the regions.
- Regions that lack data: the sky far from the Milky Way (galactic latitude beyond about 30 degrees) outside the 41 regions, for instance Ursa Major, Draco, Camelopardalis, Hercules, Boötes, Coma Berenices, Hydra, Sextans, Corvus, Pegasus, Pisces, Cetus, Sculptor, Fornax and Eridanus. Popular targets not yet added: NGC 55, NGC 300, NGC 1365, the Cat's Eye Nebula, the Antennae, M13, M104, NGC 2403, NGC 891, NGC 7023 and M1; their Gaia stars can be added to the regions pack.


To rebuild the Andromeda close-up pack from a Gaia DR3 CSV containing only stars within 1.1° of ICRS RA 10.6847°, Dec +41.269°:

```sh
python3 build_index.py regional closeups.isq.gz gaia-m31-core.csv --cell-size .075 --levels .14 .21 .31 .46 .69 --depth 15
```
