/*
 * Ready-made construction stages for a private house or villa: what to photograph before it is covered.
 * Templates suggest; they never assume the house has a given element — every shot is optional and stages can be
 * skipped, hidden or added. A photo in a stage says nothing about the quality of the work.
 */
export interface BuildTemplate {
  key: string; title: string; hint: string;
  /** Short plain-language explanation of a technical word, when there is one. */
  glossary?: string;
  shots: { key: string; label: string }[];
  /** Photos are kept per floor (columns of floor 1 never mix with floor 2). */
  perFloor: boolean;
  /** Photos can be tied to a room. */
  perRoom: boolean;
  category: string; kind: string;
  /** Part of the default set for a house / villa; the others are added on request. */
  core: boolean;
}

export const BUILD_TEMPLATES: BuildTemplate[] = [
  { key: "foundation", title: "Fundament", core: true, perFloor: false, perRoom: false, category: "general", kind: "construction",
    hint: "Fundament bağlanmadan əvvəl vacib hissələrin şəklini çəkin. Sonradan torpaq və beton altında qalan hissələri görmək mümkün olmaya bilər.",
    shots: [{ key: "excavation", label: "Fundament qazıntısı və ölçülər" }, { key: "rebar", label: "Armaturun yerləşdirilməsi" }, { key: "before_pour", label: "Armatur, qəlib və beton tökülməzdən əvvəlki vəziyyət" }, { key: "after_pour", label: "Beton töküldükdən sonra fundament" }] },
  { key: "foundation_insulation", title: "Fundamentin izolyasiyası", core: true, perFloor: false, perRoom: false, category: "insulation", kind: "construction",
    hint: "İzolyasiya torpaqla örtülməzdən əvvəl onun vəziyyətini foto ilə qeydə alın.",
    shots: [{ key: "before", label: "İzolyasiyadan əvvəl fundament" }, { key: "applying", label: "İzolyasiya materialı və örtüyün tətbiqi" }, { key: "joints", label: "Birləşmələr və künclər" }, { key: "before_backfill", label: "Torpaqla örtülməzdən əvvəl ümumi görünüş" }] },
  { key: "columns", title: "Kolonlar və rigellər", core: true, perFloor: true, perRoom: false, category: "general", kind: "construction",
    hint: "Beton tökülməzdən əvvəl armaturun və konstruksiyanın şəklini çəkin.",
    glossary: "Kolon — şaquli dayaq sütunu. Rigel (kiriş) — kolonları birləşdirən üfüqi konstruksiya.",
    shots: [{ key: "column_rebar", label: "Kolonların armaturu" }, { key: "column_layout", label: "Kolonların sayı və yerləşməsi" }, { key: "beam_rebar", label: "Rigel və kirişlərin armaturu" }, { key: "formwork", label: "Qəliblər və birləşmələr" }, { key: "after_pour", label: "Beton töküldükdən sonra" }] },
  { key: "walls", title: "Xarici və daxili divarlar", core: true, perFloor: true, perRoom: false, category: "general", kind: "construction",
    hint: "Divarlar suvaqlanmadan əvvəl onların quruluşunu foto ilə qeydə alın.",
    glossary: "Qoşa daş hörgü — divarın qalınlığı boyunca iki daş yan-yana hörülür.",
    shots: [{ key: "external", label: "Xarici divarların hörgüsü" }, { key: "thickness", label: "Divarın qalınlığını göstərən foto" }, { key: "double", label: "Qoşa daş hörgünün quruluşu" }, { key: "internal", label: "Daxili divarlar və arakəsmələr" }, { key: "openings", label: "Qapı və pəncərə boşluqları" }, { key: "overview", label: "Mərtəbənin ümumi görünüşü" }] },
  { key: "electric", title: "Elektrik xətləri", core: true, perFloor: true, perRoom: true, category: "electrical", kind: "construction",
    hint: "Divarlar suvaqlanmadan və xətlər örtülməzdən əvvəl elektrik naqillərinin yerini foto ilə qeydə alın.",
    shots: [{ key: "routes", label: "Naqillərin divarlardakı marşrutu" }, { key: "sockets", label: "Rozetka və açar nöqtələri" }, { key: "panel", label: "Elektrik şitinə gedən xətlər" }, { key: "ceiling_floor", label: "Tavan və döşəmə boyunca xətlər" }, { key: "room", label: "Otağın ümumi görünüşü" }] },
  { key: "plumbing", title: "Su və kanalizasiya xətləri", core: true, perFloor: true, perRoom: true, category: "plumbing", kind: "construction",
    hint: "Borular bağlanmazdan və divarlar örtülməzdən əvvəl onların yerini foto ilə qeydə alın.",
    shots: [{ key: "water", label: "Soyuq və isti su xətləri" }, { key: "sewer", label: "Kanalizasiya boruları" }, { key: "outlets", label: "Su çıxış nöqtələri" }, { key: "valves", label: "Ventillər və kollektorlar" }, { key: "routes", label: "Döşəmə və divar içindəki boru marşrutları" }] },
  { key: "underfloor_heating", title: "İsti döşəmə", core: true, perFloor: true, perRoom: true, category: "heating", kind: "construction",
    hint: "İsti döşəmənin boruları örtülməzdən əvvəl onların bütün əsas hissələrinin şəklini çəkin.",
    shots: [{ key: "layout", label: "Boruların döşəmə boyunca yerləşməsi" }, { key: "rooms", label: "Boruların otaqlardakı marşrutu" }, { key: "manifold", label: "Kollektor və birləşmələr" }, { key: "before_screed", label: "Örtük tökülməzdən əvvəl ümumi görünüş" }] },
  { key: "plaster", title: "Suvaq", core: true, perFloor: true, perRoom: true, category: "plaster", kind: "construction",
    hint: "Suvaq işlərini və divarların örtülməmiş vəziyyətini foto ilə qeydə alın.",
    shots: [{ key: "internal", label: "Daxili divarlar" }, { key: "facade", label: "Xarici fasad" }, { key: "overview", label: "Suvağın ümumi görünüşü" }, { key: "reveals", label: "Pəncərə və qapı kənarları" }] },
  { key: "finishing", title: "Astar, şpaklyovka və sonrakı işlər", core: true, perFloor: true, perRoom: true, category: "painting", kind: "construction",
    hint: "Divarlar son qatlarla örtülməzdən əvvəl lazım olan son fotoları əlavə edin.",
    shots: [{ key: "before", label: "Astar və şpaklyovkadan əvvəlki divarlar" }, { key: "prepared", label: "Hazırlanmış divar səthləri" }, { key: "finishing", label: "Sonrakı tamamlama işləri" }] },
  { key: "roof", title: "Dam", core: false, perFloor: false, perRoom: false, category: "roofing", kind: "construction",
    hint: "Dam örtülməzdən əvvəl konstruksiyanın və izolyasiyanın şəklini çəkin.",
    shots: [{ key: "structure", label: "Dam konstruksiyası" }, { key: "insulation", label: "İzolyasiya və membran" }, { key: "covering", label: "Dam örtüyü" }, { key: "gutters", label: "Novlar və birləşmələr" }] },
  { key: "waterproofing", title: "Hidroizolyasiya", core: false, perFloor: true, perRoom: true, category: "insulation", kind: "construction",
    hint: "Hidroizolyasiya plitə və ya örtük altında qalmazdan əvvəl şəklini çəkin.",
    shots: [{ key: "surface", label: "Hazırlanmış səth" }, { key: "layer", label: "Hidroizolyasiya qatı" }, { key: "corners", label: "Künclər və boru keçidləri" }] },
  { key: "windows_doors", title: "Pəncərələr və qapılar", core: false, perFloor: true, perRoom: true, category: "doors_windows", kind: "installation",
    hint: "Pəncərə və qapıların quraşdırılmasını, kənarların bağlanmasını qeydə alın.",
    shots: [{ key: "openings", label: "Boşluqlar quraşdırmadan əvvəl" }, { key: "installed", label: "Quraşdırılmış pəncərə və qapılar" }, { key: "sealing", label: "Kənarların izolyasiyası" }] },
];
export const templateOf = (key: string | null | undefined) => BUILD_TEMPLATES.find((t) => t.key === key) ?? null;
/** Floors a photo can be tied to: 0 basement, 1–9 floors, 10 roof / attic. */
export const FLOOR_RANGE = [0, 10] as const;
export const ROOM_KINDS = ["living", "bedroom", "kitchen", "bathroom", "toilet", "hall", "balcony", "utility", "yard", "basement", "exterior", "other"] as const;
