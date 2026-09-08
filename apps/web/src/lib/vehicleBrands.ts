// Round 4 scaffolded this with ~50 names and NO real logos at all (every
// row always rendered a generic category silhouette by design — see the
// git history of this file). Round 5 client feedback: finish it — expand
// the list and make real logos actually render. What changed this round:
//
// - `logoSlug` on a brand means a real, self-hosted SVG exists at
//   `../assets/brandLogos/<logoSlug>.svg` — sourced from the `car-brand-logos`
//   npm package (MIT-licensed compilation, real vector files, no
//   hotlinking — see LICENSE-car-brand-logos.txt copied alongside them).
//   That package covers ~100 mostly-European/luxury car brands; ~41 of
//   them overlap with brands actually relevant here and were copied in
//   (see VehicleBrandPicker.tsx for how they're loaded).
// - Brands with NO `logoSlug` still show the generic category glyph as a
//   fallback, not a broken image — this is the honest state for roughly
//   half this list: the source package has NO coverage at all for trucks,
//   heavy equipment, or motorcycles, and is missing several car brands
//   that matter more for the Libyan market than it covers (Honda, Ford,
//   Chevrolet, Chery, MG, Great Wall/Haval). Real logos for those still
//   need deliberate sourcing (manufacturer press-kit SVGs, Wikimedia
//   Commons for heavy equipment/motorcycles) — not done this round, see
//   docs/OPEN_ITEMS.md.
// - Trademark question from round 4 is unchanged and still NOT resolved:
//   bundling real manufacturer marks is low-risk for internal
//   non-commercial government software but nobody on this project can
//   clear that unilaterally. Flagged again, not silently treated as
//   settled just because more logos now render.
//
// Follow-up pass (same day, direct request from the client to close more
// of the gap): 13 more real logos added — Honda, Ford, Chevrolet, MG
// (cars), MAN, Scania, DAF, Iveco (trucks), Caterpillar, JCB, John Deere,
// Hitachi (heavy equipment), Yamaha (motorcycles) — sourced from the
// `simple-icons` npm package (CC0-licensed SVG path data; see
// LICENSE-simple-icons.md copied alongside them in the same folder — same
// "code/paths are free, the trademark isn't" caveat as the car-brand-logos
// set, nothing new here). These render as a single flat brand-color icon
// (fill set to the brand's own official hex from simple-icons' metadata),
// not the full multi-color logos the car-brand-logos set has — visually
// simpler but still a real, correctly-attributed brand mark, not a
// placeholder.
//
// STILL missing after this pass — simple-icons has no coverage either,
// these are mostly Chinese/regional manufacturers that neither source
// package covers: Chery, Great Wall/Haval/GWM, Sinotruk, Foton, JAC, Hino
// (trucks), Komatsu, Liebherr, XCMG, SANY (heavy equipment), Bajaj, TVS,
// Zongshen (motorcycles). These would need one-off manual sourcing
// (Wikimedia Commons has usable files for at least Chery, Great Wall/GWM,
// and Komatsu — not fetched this pass due to a network restriction in the
// environment that did this pass; any normal internet-connected session
// can pull them the standard way). Also note: Sinotruk's best available
// Commons file is PNG, not SVG — the logo loader in
// `VehicleBrandPicker.tsx` only globs `*.svg` today, so adding a PNG
// logo would also need that glob pattern extended to pick up `.png`.
//
// Round 6: 8 more names added (no logos — same "flag, don't silently firm
// up" rule as above), cross-checked against current Libya top-seller
// sources: Lexus, GMC (cars — Lexus specifically flagged as a notable
// MENA-market omission before this pass), Changan, Dongfeng, FAW, JMC
// (Chinese truck/pickup brands, same coverage gap category as
// Sinotruk/Foton/JAC above), Piaggio, CFMoto (motorcycles).
//
// Round 12: client gave a direct ~59-name list to check against. Cross-
// referenced against what was already here (most of it — Hyundai, Kia,
// BMW, Mercedes, Chevrolet, Toyota, GMC, Lexus, Chery, Ford, Suzuki,
// Mazda, Opel, Nissan, BYD, Audi, Peugeot, Volkswagen, Ferrari, Haval,
// Fiat, Genesis, Hummer, Infiniti, Iveco, Isuzu, Jaguar, Jeep, Land Rover,
// Lincoln, MG, Mitsubishi, Porsche, Bentley, Rolls-Royce, Chrysler, DAF,
// JAC, MINI, Renault, Dongfeng, Changan, Geely — already existed, nothing
// to add). Genuinely new:
// - Real logos sourced this round (simple-icons, same CC0 source/
//   attribution as the Honda/Ford/Chevrolet/MG set from the earlier
//   follow-up pass — LICENSE-simple-icons.md already covers the whole
//   package, not just the icons pulled before): Cadillac, Lamborghini,
//   Maserati, Subaru. Each SVG's `fill` is the brand's own official hex
//   from simple-icons' metadata (Cadillac 000000, Lamborghini B6A272,
//   Maserati 0C2340, Subaru 013C74), matching how the existing
//   simple-icons-sourced set is patched.
// - Volvo passenger cars: the file (`volvo.svg`) already existed —
//   Volvo Trucks/Volvo Construction Equipment used it, but there was no
//   plain passenger-car "Volvo" entry at all despite the client listing
//   it. Added, reusing the same logo.
// - No logo available in EITHER source package (simple-icons has no
//   coverage; flagged, not guessed at, same as the existing Chery/Haval/
//   JAC/etc. gaps): Daewoo, GAC, Dodge, Jetour, Range Rover (kept
//   separate from the existing Land Rover entry — the client listed it
//   as its own name, and it's commonly treated as its own marque),
//   Hongqi, Exeed, GWM (kept separate from the existing "Great Wall"
//   entry — GWM is the same manufacturer's own international brand name,
//   marketed as a distinct name in many regions, and the client listed
//   both), Kaiyi, Bestune, Samsung. On Samsung specifically: simple-icons
//   DOES have a "Samsung" icon, but it's Samsung Electronics' logo, not
//   Samsung Motors (the Korean car brand, now Renault Korea/Renault
//   Samsung) — using it would be a real, misleading wrong-brand mark, not
//   a shortcut, so this one stays without a logo on purpose even though a
//   same-named icon exists.
export type VehicleBrandCategory = 'car' | 'truck' | 'heavy_equipment' | 'motorcycle';

export interface VehicleBrandOption {
  name: string;
  category: VehicleBrandCategory;
  logoSlug?: string;
}

export const VEHICLE_BRANDS: VehicleBrandOption[] = [
  // Cars/SUVs — weighted toward what's actually common on Libyan roads,
  // real logo where a source package covers it.
  { name: 'Toyota', category: 'car', logoSlug: 'toyota' },
  { name: 'Hyundai', category: 'car', logoSlug: 'hyundai' },
  { name: 'Kia', category: 'car', logoSlug: 'kia' },
  { name: 'Nissan', category: 'car', logoSlug: 'nissan' },
  { name: 'Chevrolet', category: 'car', logoSlug: 'chevrolet' },
  { name: 'Mitsubishi', category: 'car', logoSlug: 'mitsubishi' },
  { name: 'Suzuki', category: 'car', logoSlug: 'suzuki' },
  { name: 'Honda', category: 'car', logoSlug: 'honda' },
  { name: 'Ford', category: 'car', logoSlug: 'ford' },
  { name: 'Peugeot', category: 'car', logoSlug: 'peugeot' },
  { name: 'Renault', category: 'car', logoSlug: 'renault' },
  { name: 'Volkswagen', category: 'car', logoSlug: 'volkswagen' },
  { name: 'Mercedes-Benz', category: 'car', logoSlug: 'mercedes-benz' },
  { name: 'BMW', category: 'car', logoSlug: 'bmw' },
  { name: 'Audi', category: 'car', logoSlug: 'audi' },
  { name: 'Jeep', category: 'car', logoSlug: 'jeep' },
  { name: 'Land Rover', category: 'car', logoSlug: 'land-rover' },
  { name: 'Mazda', category: 'car', logoSlug: 'mazda' },
  { name: 'Chery', category: 'car', logoSlug: 'chery' },
  { name: 'Geely', category: 'car', logoSlug: 'geely' },
  { name: 'MG', category: 'car', logoSlug: 'mg' },
  { name: 'Great Wall', category: 'car', logoSlug: 'gwm' },
  { name: 'Haval', category: 'car', logoSlug: 'haval' },
  { name: 'BYD', category: 'car', logoSlug: 'byd' },
  { name: 'Chrysler', category: 'car', logoSlug: 'chrysler' },
  { name: 'Citroën', category: 'car', logoSlug: 'citroen' },
  { name: 'Dacia', category: 'car', logoSlug: 'dacia' },
  { name: 'Daihatsu', category: 'car', logoSlug: 'daihatsu' },
  { name: 'Fiat', category: 'car', logoSlug: 'fiat' },
  { name: 'Opel', category: 'car', logoSlug: 'opel' },
  { name: 'SEAT', category: 'car', logoSlug: 'seat' },
  { name: 'Škoda', category: 'car', logoSlug: 'skoda' },
  { name: 'DS', category: 'car', logoSlug: 'ds' },
  { name: 'MINI', category: 'car', logoSlug: 'mini' },
  { name: 'Infiniti', category: 'car', logoSlug: 'infiniti' },
  { name: 'Genesis', category: 'car', logoSlug: 'genesis' },
  { name: 'Tesla', category: 'car', logoSlug: 'tesla' },
  { name: 'Rolls-Royce', category: 'car', logoSlug: 'rolls-royce' },
  { name: 'Bentley', category: 'car', logoSlug: 'bentley' },
  { name: 'Ferrari', category: 'car', logoSlug: 'ferrari' },
  { name: 'Porsche', category: 'car', logoSlug: 'porsche' },
  { name: 'Lincoln', category: 'car', logoSlug: 'lincoln' },
  { name: 'Jaguar', category: 'car', logoSlug: 'jaguar' },
  { name: 'RAM', category: 'car', logoSlug: 'ram' },
  { name: 'Hummer', category: 'car', logoSlug: 'hummer' },
  { name: 'Lotus', category: 'car', logoSlug: 'lotus' },
  { name: 'Lexus', category: 'car', logoSlug: 'lexus' },
  { name: 'GMC', category: 'car', logoSlug: 'gmc' },
  { name: 'Volvo', category: 'car', logoSlug: 'volvo' },
  { name: 'Cadillac', category: 'car', logoSlug: 'cadillac' },
  { name: 'Lamborghini', category: 'car', logoSlug: 'lamborghini' },
  { name: 'Maserati', category: 'car', logoSlug: 'maserati' },
  { name: 'Subaru', category: 'car', logoSlug: 'subaru' },
  { name: 'Dodge', category: 'car' },
  { name: 'Daewoo', category: 'car', logoSlug: 'daewoo' },
  { name: 'GAC', category: 'car' },
  { name: 'Jetour', category: 'car', logoSlug: 'jetour' },
  { name: 'Range Rover', category: 'car', logoSlug: 'range-rover' },
  { name: 'Hongqi', category: 'car' },
  { name: 'Exeed', category: 'car', logoSlug: 'exeed' },
  { name: 'GWM', category: 'car', logoSlug: 'gwm' },
  { name: 'Kaiyi', category: 'car', logoSlug: 'kaiyi' },
  { name: 'Bestune', category: 'car' },
  { name: 'Samsung', category: 'car' },

  // Trucks/commercial
  { name: 'Mercedes-Benz Trucks', category: 'truck', logoSlug: 'mercedes-benz' },
  { name: 'MAN', category: 'truck', logoSlug: 'man' },
  { name: 'Volvo Trucks', category: 'truck', logoSlug: 'volvo' },
  { name: 'Scania', category: 'truck', logoSlug: 'scania' },
  { name: 'Sinotruk', category: 'truck', logoSlug: 'sinotruk' },
  { name: 'Foton', category: 'truck', logoSlug: 'foton' },
  { name: 'JAC', category: 'truck' },
  { name: 'Isuzu', category: 'truck', logoSlug: 'isuzu' },
  { name: 'Hino', category: 'truck', logoSlug: 'hino' },
  { name: 'DAF', category: 'truck', logoSlug: 'daf' },
  { name: 'Iveco', category: 'truck', logoSlug: 'iveco' },
  { name: 'Changan', category: 'truck', logoSlug: 'changan' },
  { name: 'Dongfeng', category: 'truck', logoSlug: 'dongfeng' },
  { name: 'FAW', category: 'truck' },
  { name: 'JMC', category: 'truck', logoSlug: 'jmc' },

  // Heavy machinery/equipment
  { name: 'Caterpillar', category: 'heavy_equipment', logoSlug: 'caterpillar' },
  { name: 'Komatsu', category: 'heavy_equipment', logoSlug: 'komatsu' },
  { name: 'Volvo Construction Equipment', category: 'heavy_equipment', logoSlug: 'volvo' },
  { name: 'JCB', category: 'heavy_equipment', logoSlug: 'jcb' },
  { name: 'Liebherr', category: 'heavy_equipment', logoSlug: 'liebherr' },
  { name: 'XCMG', category: 'heavy_equipment', logoSlug: 'xcmg' },
  { name: 'SANY', category: 'heavy_equipment', logoSlug: 'sany' },
  { name: 'John Deere', category: 'heavy_equipment', logoSlug: 'john-deere' },
  { name: 'Hitachi Construction Machinery', category: 'heavy_equipment', logoSlug: 'hitachi' },

  // Motorcycles
  { name: 'Honda (دراجة)', category: 'motorcycle', logoSlug: 'honda' },
  { name: 'Yamaha', category: 'motorcycle', logoSlug: 'yamaha' },
  { name: 'Suzuki (دراجة)', category: 'motorcycle', logoSlug: 'suzuki' },
  { name: 'Bajaj', category: 'motorcycle', logoSlug: 'bajaj' },
  { name: 'TVS', category: 'motorcycle' },
  { name: 'Zongshen', category: 'motorcycle' },
  { name: 'Piaggio', category: 'motorcycle' },
  { name: 'CFMoto', category: 'motorcycle', logoSlug: 'cfmoto' },

  // Round 18: explicit escape hatch for a brand genuinely not in this list
  // — the picker already silently accepted free text typed here, but
  // nothing told the user that was an option. This entry is never matched
  // by VehicleBrandLogo's exact-name lookup (no logoSlug, and the picker
  // treats selecting it as "clear and let them type their own name"
  // rather than saving the literal string "أخرى" as a brand).
  { name: 'أخرى / غير ذلك', category: 'car' },
];

export const VEHICLE_BRAND_CATEGORY_LABELS: Record<VehicleBrandCategory, string> = {
  car: 'سيارات',
  truck: 'شاحنات',
  heavy_equipment: 'معدات ثقيلة',
  motorcycle: 'دراجات نارية',
};
