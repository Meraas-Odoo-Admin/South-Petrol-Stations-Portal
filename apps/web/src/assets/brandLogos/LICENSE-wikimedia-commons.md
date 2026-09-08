# Wikimedia Commons — logo sourcing (round 18)

The 22 files below were downloaded individually from Wikimedia Commons to
close the remaining gap in `../../lib/vehicleBrands.ts` (brands the
`car-brand-logos`/`simple-icons` packages don't cover — mostly Chinese
manufacturers and heavy-equipment/motorcycle brands). Each is either
**Public Domain** (the manufacturer's own logo, below the threshold of
originality in most jurisdictions) or **CC BY-SA 4.0** (marked below) —
verified per-file via Commons' own `imageinfo` API at download time, not
assumed. Same "the code/vector data is free, the trademark itself isn't"
caveat as the other two LICENSE files in this folder — this is about
copyright licensing of the image file, not a trademark clearance (see
`vehicleBrands.ts`'s own header comment on that still-open question).

| File | Source | License |
|---|---|---|
| chery.svg | commons.wikimedia.org/wiki/File:Chery_logo.svg | Public domain |
| gwm.svg | commons.wikimedia.org/wiki/File:GWM_2025_logo.svg | Public domain |
| haval.svg | commons.wikimedia.org/wiki/File:Haval_2023_logo.svg | Public domain |
| lexus.svg | commons.wikimedia.org/wiki/File:Lexus.svg | Public domain |
| gmc.svg | commons.wikimedia.org/wiki/File:GMC_logo.svg | Public domain |
| daewoo.svg | commons.wikimedia.org/wiki/File:Logo_wordmark_DAEWOO_Motors_(2002-2016).svg | Public domain |
| jetour.svg | commons.wikimedia.org/wiki/File:Jetour_logo.svg | Public domain |
| range-rover.svg | commons.wikimedia.org/wiki/File:Range_Rover_logo.svg | **CC BY-SA 4.0** |
| dongfeng.svg | commons.wikimedia.org/wiki/File:Dongfeng_Motor_logo.svg | Public domain |
| changan.svg | commons.wikimedia.org/wiki/File:Changan_icon.svg | **CC BY-SA 4.0** |
| foton.svg | commons.wikimedia.org/wiki/File:Foton_Motor_logo.svg | Public domain |
| hino.svg | commons.wikimedia.org/wiki/File:Hino_logo.svg | Public domain |
| komatsu.svg | commons.wikimedia.org/wiki/File:Komatsu_company_logos.svg | Public domain |
| liebherr.svg | commons.wikimedia.org/wiki/File:Liebherr_logo.svg | Public domain |
| xcmg.svg | commons.wikimedia.org/wiki/File:XCMG_logo.svg | Public domain |
| sany.svg | commons.wikimedia.org/wiki/File:Logo_Sany_Heavy_Industry_Co.,_Ltd.svg | **CC BY-SA 4.0** |
| bajaj.svg | commons.wikimedia.org/wiki/File:Bajaj_Auto_logo.svg | Public domain |
| cfmoto.svg | commons.wikimedia.org/wiki/File:CFMOTO_Logo.svg | Public domain |
| sinotruk.svg | commons.wikimedia.org/wiki/File:Sinotruk_logo_2.png | Public domain (raster, re-encoded as SVG — see below) |
| exeed.svg | commons.wikimedia.org/wiki/File:Exeed_logo.png | Public domain (raster, re-encoded as SVG) |
| kaiyi.svg | commons.wikimedia.org/wiki/File:Kaiyi_logo.png | Public domain (raster, re-encoded as SVG) |
| jmc.svg | commons.wikimedia.org/wiki/File:JMC_Motor_logo.png | Public domain (raster, re-encoded as SVG) |

**Raster re-encoding**: four of the above (sinotruk/exeed/kaiyi/jmc) had no
SVG version on Commons — only PNG. `VehicleBrandPicker.tsx`'s loader only
globs `*.svg`, so rather than changing that glob, each PNG was downscaled
(max 240px) and wrapped in a minimal `<svg><image href="data:image/png;
base64,...">` container — a real `.svg` file the existing loader picks up
unmodified, not a placeholder.

**Still no usable file found** (searched Commons, no logo-only SVG/PNG
exists there separate from a sub-brand or a photo of the vehicle itself):
GAC, FAW, JAC, TVS, Zongshen, Hongqi, Bestune, Dodge. These keep the
generic category glyph, same honest-gap treatment as before this round —
not silently left unlisted, not guessed at with a wrong/similar logo.
