import React, { useState, useMemo } from "react";

/* ---------- utilidades de cálculo ---------- */

const num = (v) => (v === "" || v === null || v === undefined ? null : parseFloat(v));
const has = (v) => v !== "" && v !== null && v !== undefined && !Number.isNaN(v);

function bmiOf(data) {
  const w = num(data.weight), h = num(data.height);
  if (!has(w) || !has(h)) return null;
  return w / Math.pow(h / 100, 2);
}
function egfrOf(data) {
  const scr = num(data.creatinine), age = num(data.age), sex = data.sex;
  if (!has(scr) || !has(age) || !sex) return null;
  const k = sex === "F" ? 0.7 : 0.9;
  const a = sex === "F" ? -0.241 : -0.302;
  const min = Math.min(scr / k, 1);
  const max = Math.max(scr / k, 1);
  let egfr = 142 * Math.pow(min, a) * Math.pow(max, -1.2) * Math.pow(0.9938, age);
  if (sex === "F") egfr *= 1.012;
  return egfr;
}
function gCategory(egfr) {
  if (egfr >= 90) return { code: "G1", label: "≥90" };
  if (egfr >= 60) return { code: "G2", label: "60–89" };
  if (egfr >= 45) return { code: "G3a", label: "45–59" };
  if (egfr >= 30) return { code: "G3b", label: "30–44" };
  if (egfr >= 15) return { code: "G4", label: "15–29" };
  return { code: "G5", label: "<15" };
}
function aCategory(uacr) {
  if (uacr < 30) return { code: "A1", label: "<30 mg/g" };
  if (uacr <= 300) return { code: "A2", label: "30–300 mg/g" };
  return { code: "A3", label: ">300 mg/g" };
}
const KDIGO_GRID = {
  G1: { A1: "bajo", A2: "moderado", A3: "alto" },
  G2: { A1: "bajo", A2: "moderado", A3: "alto" },
  G3a: { A1: "moderado", A2: "alto", A3: "muy alto" },
  G3b: { A1: "alto", A2: "muy alto", A3: "muy alto" },
  G4: { A1: "muy alto", A2: "muy alto", A3: "muy alto" },
  G5: { A1: "muy alto", A2: "muy alto", A3: "muy alto" },
};

/* ---------- definición de scores ---------- */

const SCORES = [
  {
    id: "fib4",
    name: "FIB-4",
    group: "Hepático",
    required: ["age", "ast", "alt", "platelets"],
    calc: (d) => {
      const age = num(d.age), ast = num(d.ast), alt = num(d.alt), plt = num(d.platelets);
      const v = (age * ast) / (plt * Math.sqrt(alt));
      let read;
      if (v < 1.45) read = "Baja probabilidad de fibrosis avanzada";
      else if (v > 3.25) read = "Alta probabilidad de fibrosis avanzada — considerar derivación a hepatología";
      else read = "Zona indeterminada — considerar elastografía / FibroScan";
      return { value: v.toFixed(2), unit: "", read };
    },
  },
  {
    id: "cha2ds2vasc",
    name: "CHA₂DS₂-VASc",
    group: "Cardio",
    required: ["age", "sex", "chf", "htn", "stroke", "vascular", "dm"],
    calc: (d) => {
      const age = num(d.age);
      let pts = 0;
      pts += age >= 75 ? 2 : age >= 65 ? 1 : 0;
      pts += d.sex === "F" ? 1 : 0;
      pts += d.chf === "si" ? 1 : 0;
      pts += d.htn === "si" ? 1 : 0;
      pts += d.stroke === "si" ? 2 : 0;
      pts += d.vascular === "si" ? 1 : 0;
      pts += d.dm === "si" ? 1 : 0;
      const highThresh = d.sex === "F" ? 3 : 2;
      const read = pts >= highThresh
        ? "Riesgo alto — anticoagulación generalmente indicada"
        : pts === highThresh - 1
        ? "Riesgo intermedio — anticoagulación a considerar"
        : "Riesgo bajo";
      return { value: pts, unit: "pts", read };
    },
  },
  {
    id: "egfr",
    name: "eGFR (CKD-EPI 2021)",
    group: "Renal",
    required: ["age", "sex", "creatinine"],
    calc: (d) => {
      const e = egfrOf(d);
      const g = gCategory(e);
      return { value: e.toFixed(0), unit: "mL/min/1.73m²", read: `Categoría ${g.code} (${g.label})` };
    },
  },
  {
    id: "kdigo",
    name: "KDIGO (G + A)",
    group: "Renal",
    required: ["age", "sex", "creatinine", "uacr"],
    calc: (d) => {
      const e = egfrOf(d);
      const g = gCategory(e);
      const a = aCategory(num(d.uacr));
      const risk = KDIGO_GRID[g.code][a.code];
      return {
        value: `${g.code} / ${a.code}`,
        unit: "",
        read: `eGFR ${e.toFixed(0)} · UACR ${d.uacr} mg/g — riesgo combinado: ${risk.toUpperCase()}`,
      };
    },
  },
  {
    id: "tyg",
    name: "TyG index",
    group: "Metabólico",
    required: ["tgs", "glucose"],
    calc: (d) => {
      const tg = num(d.tgs), gl = num(d.glucose);
      const v = Math.log((tg * gl) / 2);
      const read = v >= 4.68
        ? "Sugiere insulinorresistencia (corte referencial ~4.68, variable según población)"
        : "Sin sugerencia de insulinorresistencia por este índice";
      return { value: v.toFixed(2), unit: "", read };
    },
  },
  {
    id: "stopbang",
    name: "STOP-BANG",
    group: "Sueño",
    required: ["snoring", "tiredness", "observedApnea", "htn", "age", "sex", "weight", "height", "neckLarge"],
    calc: (d) => {
      const bmi = bmiOf(d);
      const age = num(d.age);
      let pts = 0;
      pts += d.snoring === "si" ? 1 : 0;
      pts += d.tiredness === "si" ? 1 : 0;
      pts += d.observedApnea === "si" ? 1 : 0;
      pts += d.htn === "si" ? 1 : 0;
      pts += bmi > 35 ? 1 : 0;
      pts += age > 50 ? 1 : 0;
      pts += d.neckLarge === "si" ? 1 : 0;
      pts += d.sex === "M" ? 1 : 0;
      const read = pts >= 5 ? "Riesgo alto de SAHOS" : pts >= 3 ? "Riesgo intermedio de SAHOS" : "Riesgo bajo de SAHOS";
      return { value: pts, unit: "/8", read };
    },
  },
  {
    id: "prevent",
    name: "AHA PREVENT",
    group: "Cardio",
    required: ["age", "sex", "sbp", "totalChol", "hdl", "smoker", "dm", "onAntihtn", "onStatin", "creatinine", "weight", "height"],
    calc: (d) => {
      const age = num(d.age), sbp = num(d.sbp), tc = num(d.totalChol), hdl = num(d.hdl);
      const bmi = bmiOf(d), egfr = egfrOf(d);
      const outOfRange = [];
      if (age < 30 || age > 79) outOfRange.push("edad (válido 30–79)");
      if (tc < 130 || tc > 320) outOfRange.push("col. total (válido 130–320)");
      if (hdl < 20 || hdl > 100) outOfRange.push("HDL (válido 20–100)");
      if (sbp < 90 || sbp > 200) outOfRange.push("TA sistólica (válido 90–200)");
      if (bmi < 18.5 || bmi >= 40) outOfRange.push("IMC (válido 18.5–39.9, afecta solo IC)");
      if (egfr <= 0) outOfRange.push("eGFR");
      if (outOfRange.length > 0) {
        return { value: "—", unit: "", read: `Fuera de rango validado por el modelo: ${outOfRange.join("; ")}. El paquete oficial devuelve NA en estos casos, así que no se calcula.` };
      }
      const t = preventTransform(d);
      const sexIdx = d.sex === "F" ? 1 : 0;
      const cvd10 = toRiskPct(preventLinPred(PREVENT_COEF.y10[`cvd_${sexIdx}`], t));
      const ascvd10 = toRiskPct(preventLinPred(PREVENT_COEF.y10[`ascvd_${sexIdx}`], t));
      const hf10 = toRiskPct(preventLinPred(PREVENT_COEF.y10hf[`hf_${sexIdx}`], t));
      let line30 = "30 años: no aplica (modelo válido solo 30–59 años).";
      if (t.ageRaw <= 59) {
        const cvd30 = toRiskPct(preventLinPred(PREVENT_COEF.y30[`cvd_${sexIdx}`], t));
        const ascvd30 = toRiskPct(preventLinPred(PREVENT_COEF.y30[`ascvd_${sexIdx}`], t));
        const hf30 = toRiskPct(preventLinPred(PREVENT_COEF.y30hf[`hf_${sexIdx}`], t));
        line30 = `30 años — CVD total: ${cvd30.toFixed(1)}% · ASCVD: ${ascvd30.toFixed(1)}% · IC: ${hf30.toFixed(1)}%.`;
      }
      return {
        value: cvd10.toFixed(1),
        unit: "% (CVD 10a)",
        read: `Modelo base, validado contra el paquete oficial (AHAprevent R, v1.0.0) — coincide exacto en los casos de prueba. 10 años — CVD total: ${cvd10.toFixed(1)}% · ASCVD: ${ascvd10.toFixed(1)}% · IC: ${hf10.toFixed(1)}%. ${line30}`,
      };
    },
  },
  {
    id: "eoss",
    name: "EOSS",
    group: "Obesidad",
    required: ["eossRisk", "eossFunction", "eossPsych"],
    calc: (d) => {
      const stage = Math.max(num(d.eossRisk), num(d.eossFunction), num(d.eossPsych));
      const MGMT = {
        0: "Identificar factores contribuyentes; consejo sobre estilo de vida.",
        1: "Investigar otros contribuyentes no relacionados con el peso; intervención de estilo de vida más intensiva; monitoreo.",
        2: "Iniciar tratamiento de obesidad (conductual/farmacológico/quirúrgico según corresponda); manejo estrecho de comorbilidades.",
        3: "Tratamiento más intensivo de la obesidad; manejo agresivo de comorbilidades.",
        4: "Manejo agresivo según factibilidad; considerar manejo del dolor, terapia ocupacional, apoyo psicosocial.",
      };
      return { value: stage, unit: "", read: `Estadio ${stage} (máximo de los 3 dominios) — ${MGMT[stage]}` };
    },
  },
  {
    id: "bmi",
    name: "IMC",
    group: "Obesidad",
    required: ["weight", "height"],
    calc: (d) => {
      const v = bmiOf(d);
      let read;
      if (v < 18.5) read = "Bajo peso";
      else if (v < 25) read = "Normal";
      else if (v < 30) read = "Sobrepeso";
      else if (v < 35) read = "Obesidad grado I";
      else if (v < 40) read = "Obesidad grado II";
      else read = "Obesidad grado III";
      return { value: v.toFixed(1), unit: "kg/m²", read };
    },
  },
  {
    id: "waist",
    name: "Circunferencia de cintura",
    group: "Obesidad",
    required: ["waist", "sex"],
    calc: (d) => {
      const w = num(d.waist);
      const cut = d.sex === "M" ? [94, 102] : [80, 88];
      let read;
      if (w < cut[0]) read = "Sin riesgo aumentado";
      else if (w < cut[1]) read = "Riesgo aumentado";
      else read = "Riesgo sustancialmente aumentado";
      return { value: w, unit: "cm", read };
    },
  },
  {
    id: "whtr",
    name: "Cintura / Talla",
    group: "Obesidad",
    required: ["waist", "height"],
    calc: (d) => {
      const w = num(d.waist), h = num(d.height);
      const v = w / h;
      const read = v >= 0.5 ? "≥0.5 — riesgo cardiometabólico aumentado" : "<0.5 — dentro de rango esperado";
      return { value: v.toFixed(2), unit: "", read };
    },
  },
];

const FIELD_LABELS = {
  age: "Edad", sex: "Sexo", ast: "AST/GOT", alt: "ALT/GPT", platelets: "Plaquetas",
  creatinine: "Creatinina", tgs: "Triglicéridos", glucose: "Glucemia", totalChol: "Col. total",
  hdl: "HDL", uacr: "UACR (albúmina/creatinina en orina)", htn: "HTA", dm: "Diabetes",
  disglucemia: "Disglucemia (prediabetes)",
  stroke: "ACV/AIT previo", vascular: "Enf. vascular", chf: "Insuf. cardíaca", sbp: "TA sistólica",
  smoker: "Tabaquismo", onStatin: "Estatina actual", onAntihtn: "Antihipertensivo actual",
  weight: "Peso", height: "Talla", waist: "Circ. de cintura", snoring: "Ronquido",
  tiredness: "Cansancio diurno", observedApnea: "Apnea observada", neckLarge: "Cuello >40cm",
  eossRisk: "EOSS — factores de riesgo asociados", eossFunction: "EOSS — limitación funcional",
  eossPsych: "EOSS — síntomas psicológicos",
  anticoag: "Anticoagulación actual",
  menopausiaPrecoz: "Menopausia temprana/precoz", htaGestacional: "HTA gestacional",
  dbtGestacional: "DBT gestacional", bajoPesoNacer: "Hijos con bajo peso al nacer",
  abortosEspontaneos: "Abortos espontáneos", tratamientoEstrogenico: "Tratamiento estrogénico",
};

function hasVal(v) {
  return v !== "" && v !== null && v !== undefined;
}

/* ---------- UI ---------- */

const GROUP_COLOR = {
  Cardio: "#5B8DEF",
  Renal: "#3FB8A8",
  Hepático: "#C98A3E",
  Metabólico: "#B473D6",
  Sueño: "#6B7A99",
  Obesidad: "#5FA35A",
};

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-[11px]" style={{ color: '#8B93A7' }}>
      <span className="uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange, placeholder }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-[#5B8DEF] focus:ring-1 focus:ring-[#5B8DEF]" style={{ background: '#1A1F29', borderColor: '#2A3140', color: '#E7EAF0' }}
    />
  );
}

function TriSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#5B8DEF] focus:ring-1 focus:ring-[#5B8DEF]" style={{ background: '#1A1F29', borderColor: '#2A3140', color: '#E7EAF0' }}
    >
      <option value="">—</option>
      <option value="si">Sí</option>
      <option value="no">No</option>
    </select>
  );
}

function SexSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#5B8DEF] focus:ring-1 focus:ring-[#5B8DEF]" style={{ background: '#1A1F29', borderColor: '#2A3140', color: '#E7EAF0' }}
    >
      <option value="">—</option>
      <option value="M">M</option>
      <option value="F">F</option>
    </select>
  );
}

function DomainSelect({ value, onChange, anchors }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#5B8DEF] focus:ring-1 focus:ring-[#5B8DEF]" style={{ background: '#1A1F29', borderColor: '#2A3140', color: '#E7EAF0' }}
    >
      <option value="">—</option>
      {anchors.map((a, i) => (
        <option key={i} value={i}>{i} — {a}</option>
      ))}
    </select>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#232A38' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ background: '#161B24', color: '#C7CDDB' }}
      >
        {title}
        <span className="" style={{ color: '#5B6478' }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="p-3 grid grid-cols-2 gap-3">{children}</div>}
    </div>
  );
}

const LAB_KEY_MAP = {
  AST_TGO: "ast",
  ALT_TGP: "alt",
  Plaquetas: "platelets",
  Creatinina: "creatinine",
  TG: "tgs",
  Glucosa: "glucose",
  Col: "totalChol",
  HDL: "hdl",
};

const HCLAB_ALIASES = {
  ast: ["GOT", "TGO", "AST"],
  alt: ["GPT", "TGP", "ALT"],
  platelets: ["PLAQ", "PLQ", "PLT"],
  creatinine: ["CR", "CREA", "CREAT"],
  tgs: ["TG", "TRIG"],
  glucose: ["GLU", "GLUC", "GLICEMIA", "GLUCEMIA"],
  totalChol: ["COL", "COLT", "COLESTEROL"],
  hdl: ["HDL"],
};

/* ---------- Extractor de texto HCOP (palabras clave + evidencia) ---------- */

function findMatch(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

/* Como findMatch, pero descarta menciones precedidas de negación
   ("sin apnea observada", "niega ronquido", "no presenta...") para no
   convertir un hallazgo NEGATIVO en un "sí" silencioso. */
function positiveMatch(text, patterns) {
  for (const p of patterns) {
    const flags = p.flags.includes("g") ? p.flags : p.flags + "g";
    const re = new RegExp(p.source, flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, m.index - 25);
      const context = text.slice(start, m.index);
      const negated = /\b(sin|niega|no|ausencia de|negativo para|descarta)\s+[\wáéíóúñÁÉÍÓÚÑ]*\s*$/i.test(context);
      if (!negated) return m[0];
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }
  return null;
}

const HCOP_BINARY_FIELDS = [
  { field: "htn", positive: [/\bHTA\b/i, /hipertensi[oó]n arterial/i], negative: [/sin\s+HTA/i, /niega\s+HTA/i, /no\s+hipertens/i] },
  { field: "dm", positive: [/\bDBT\b\s*(tipo)?\s*[12]?/i, /diabetes(\s+tipo\s*[12])?/i, /\bDM2?\b/i], negative: [/sin\s+DBT/i, /niega\s+diabetes/i, /no\s+diab[eé]tic/i] },
  { field: "stroke", positive: [/\bACV\b/i, /\bAIT\b/i, /accidente\s+cerebrovascular/i], negative: [/sin\s+ACV/i, /niega\s+ACV/i, /sin\s+AIT/i] },
  { field: "vascular", positive: [/enfermedad\s+vascular/i, /vasculopat[ií]a/i, /enfermedad\s+arterial\s+period[eé]rica/i, /\bEAP\b/i], negative: [/sin\s+enfermedad\s+vascular/i] },
  { field: "chf", positive: [/insuficiencia\s+card[ií]aca/i, /\bICC\b/i], negative: [/sin\s+insuficiencia\s+card[ií]aca/i, /niega\s+ICC/i] },
];

function detectSmoking(text) {
  if (/ex[- ]?tabaquis/i.test(text)) return { value: "no", snippet: findMatch(text, [/ex[- ]?tabaquis\w*[^.,;]*/i]) };
  if (/niega\s+tabaquismo|no\s+fuma/i.test(text)) return { value: "no", snippet: findMatch(text, [/(niega\s+tabaquismo|no\s+fuma)[^.,;]*/i]) };
  if (/tabaquis(mo|ta)/i.test(text)) return { value: "si", snippet: findMatch(text, [/[^.,;]*tabaquis\w*[^.,;]*/i]) };
  return null;
}

const MED_CLASSES = {
  onStatin: [/atorvastatina/i, /rosuvastatina/i, /simvastatina/i, /pravastatina/i, /pitavastatina/i, /fluvastatina/i, /lovastatina/i],
  onAntihtn: [/enalapril/i, /lisinopril/i, /ramipril/i, /losart[aá]n/i, /valsart[aá]n/i, /irbesart[aá]n/i, /candesart[aá]n/i, /telmisart[aá]n/i, /amlodipina/i, /nifedipina/i, /atenolol/i, /bisoprolol/i, /carvedilol/i, /metoprolol/i, /hidroclorotiazida/i, /indapamida/i, /clortalidona/i, /espironolactona/i, /doxazosina/i, /clonidina/i],
  anticoag: [/warfarina/i, /acenocumarol/i, /dabigatr[aá]n/i, /rivaroxab[aá]n/i, /apixab[aá]n/i, /edoxab[aá]n/i],
};

const GYNO_FIELDS = [
  { field: "menopausiaPrecoz", patterns: [/menopausia\s+(precoz|temprana)/i] },
  { field: "htaGestacional", patterns: [/HTA\s+gestacional/i, /hipertensi[oó]n\s+gestacional/i] },
  { field: "dbtGestacional", patterns: [/(DBT|diabetes)\s+gestacional/i] },
  { field: "bajoPesoNacer", patterns: [/bajo\s+peso\s+al\s+nacer/i, /hijos?\s+con\s+bajo\s+peso/i] },
  { field: "abortosEspontaneos", patterns: [/abortos?\s+espont[aá]neos?/i] },
  { field: "tratamientoEstrogenico", patterns: [/tratamiento\s+estrog[eé]nico/i, /terapia\s+de\s+reemplazo\s+hormonal/i, /\bTRH\b/i] },
];

const SLEEP_FIELDS = [
  { field: "snoring", patterns: [/ronquido/i, /ronca(dor)?/i] },
  { field: "tiredness", patterns: [/cansancio\s+diurno/i, /somnolencia\s+diurna/i] },
  { field: "observedApnea", patterns: [/apnea\s+observada/i, /pausas\s+respiratorias\s+observadas/i] },
];

/* ---------- Bloque técnico CAMPO=VALOR (matcheo literal, sin heurística) ----------
   Formato que genera el skill HCOP junto a la nota: una línea por dato,
   "?" cuando no fue dictado (nunca se setea nada en ese caso). */

const CAMPO_MAP = {
  EDAD: { field: "age", type: "number" },
  SEXO: { field: "sex", type: "sex" },
  HTA: { field: "htn", type: "bool" },
  DM: { field: "dm", type: "bool" },
  DISGLUCEMIA: { field: "disglucemia", type: "bool" },
  ACV_AIT: { field: "stroke", type: "bool" },
  ENF_VASCULAR: { field: "vascular", type: "bool" },
  IC: { field: "chf", type: "bool" },
  TABAQUISMO: { field: "smoker", type: "bool" },
  ESTATINA: { field: "onStatin", type: "bool" },
  ANTIHIPERTENSIVO: { field: "onAntihtn", type: "bool" },
  ANTICOAGULACION: { field: "anticoag", type: "bool" },
  RONQUIDO: { field: "snoring", type: "bool" },
  CANSANCIO_DIURNO: { field: "tiredness", type: "bool" },
  APNEA_OBSERVADA: { field: "observedApnea", type: "bool" },
  CUELLO: { field: "neckLarge", type: "bool" },
  PESO: { field: "weight", type: "number" },
  TALLA: { field: "height", type: "number" },
  CINTURA: { field: "waist", type: "number" },
  MENOPAUSIA_PRECOZ: { field: "menopausiaPrecoz", type: "bool" },
  HTA_GESTACIONAL: { field: "htaGestacional", type: "bool" },
  DBT_GESTACIONAL: { field: "dbtGestacional", type: "bool" },
  BAJO_PESO_NACER: { field: "bajoPesoNacer", type: "bool" },
  ABORTOS_ESPONTANEOS: { field: "abortosEspontaneos", type: "bool" },
  TRATAMIENTO_ESTROGENICO: { field: "tratamientoEstrogenico", type: "bool" },
};

function parseCampoValorBlock(text) {
  const mapped = {};
  const evidence = [];
  const tokens = text.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    const m = t.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ_]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toUpperCase();
    const rawVal = m[2].trim();
    const def = CAMPO_MAP[key];
    if (!def) continue; // campo no reconocido: se ignora, no se intenta adivinar
    if (rawVal === "?") continue; // no dictado: no se setea nada

    if (def.type === "bool") {
      const up = rawVal.toUpperCase();
      if (up === "SI" || up === "SÍ") mapped[def.field] = "si";
      else if (up === "NO") mapped[def.field] = "no";
      else continue; // valor no literal SI/NO/?: se ignora sin heurística
      evidence.push({ field: def.field, label: FIELD_LABELS[def.field] || def.field, snippet: `${key}=${rawVal}`, literal: true });
    } else if (def.type === "number") {
      const n = parseFloat(rawVal.replace(",", "."));
      if (isNaN(n)) continue;
      mapped[def.field] = n;
      evidence.push({ field: def.field, label: FIELD_LABELS[def.field] || def.field, snippet: `${key}=${rawVal}`, literal: true });
    } else if (def.type === "sex") {
      const up = rawVal.toUpperCase();
      if (up !== "M" && up !== "F") continue;
      mapped[def.field] = up;
      evidence.push({ field: def.field, label: "Sexo", snippet: `${key}=${rawVal}`, literal: true });
    }
  }
  return { mapped, evidence };
}

/* Extrae el código del header "— Código: XXXX —" (formato [3 díg. año][3 iniciales][1 díg.], ej. 974JCG0) */
function extractCodeFromText(text) {
  const m = text.match(/—?\s*C[oó]digo:\s*([A-Za-z0-9]+)\s*—?/);
  return m ? m[1].trim() : null;
}

function parseHcopCombined(text) {
  const heuristic = parseHcopText(text);
  const literal = parseCampoValorBlock(text);
  const heurMapped = heuristic.ok ? heuristic.mapped : {};
  const heurEvidence = heuristic.ok ? heuristic.evidence : [];
  // el literal es autoritativo: pisa cualquier coincidencia heurística del mismo campo
  const mapped = { ...heurMapped, ...literal.mapped };
  const evidence = [
    ...heurEvidence.filter((e) => !(e.field in literal.mapped)),
    ...literal.evidence,
  ];
  const eossMention = heuristic.ok ? heuristic.eossMention : /\bEOSS\b/i.test(text);
  if (Object.keys(mapped).length === 0) {
    return { ok: false, msg: "No reconocí ningún dato — ni por texto libre ni por bloque CAMPO=VALOR." };
  }
  return { ok: true, mapped, evidence, eossMention };
}

function parseHcopText(text) {
  const evidence = [];
  const mapped = {};

  const ageSex = text.match(/Consultante de\s*(\d+)\s*años,?\s*sexo\s*(masculino|femenino|M|F)/i);
  if (ageSex) {
    mapped.age = parseInt(ageSex[1], 10);
    mapped.sex = /f/i.test(ageSex[2][0]) ? "F" : "M";
    evidence.push({ field: "age", label: "Edad/Sexo", snippet: ageSex[0] });
  }

  for (const { field, positive, negative } of HCOP_BINARY_FIELDS) {
    const neg = negative ? findMatch(text, negative) : null;
    if (neg) {
      mapped[field] = "no";
      evidence.push({ field, label: FIELD_LABELS[field] || field, snippet: neg });
      continue;
    }
    const pos = findMatch(text, positive);
    if (pos) {
      mapped[field] = "si";
      evidence.push({ field, label: FIELD_LABELS[field] || field, snippet: pos });
    }
  }

  const smoke = detectSmoking(text);
  if (smoke) {
    mapped.smoker = smoke.value;
    evidence.push({ field: "smoker", label: "Tabaquismo", snippet: smoke.snippet });
  }

  for (const field in MED_CLASSES) {
    const hit = positiveMatch(text, MED_CLASSES[field]);
    if (hit) {
      mapped[field] = "si";
      evidence.push({ field, label: FIELD_LABELS[field] || field, snippet: hit });
    }
  }

  for (const { field, patterns } of GYNO_FIELDS) {
    const hit = positiveMatch(text, patterns);
    if (hit) {
      mapped[field] = "si";
      evidence.push({ field, label: FIELD_LABELS[field] || field, snippet: hit });
    }
  }

  for (const { field, patterns } of SLEEP_FIELDS) {
    const hit = positiveMatch(text, patterns);
    if (hit) {
      mapped[field] = "si";
      evidence.push({ field, label: FIELD_LABELS[field] || field, snippet: hit });
    }
  }

  const neckMatch = text.match(/cuello[^.,;]*?(\d{2})\s*cm/i);
  if (neckMatch) {
    const val = parseInt(neckMatch[1], 10);
    if (val > 40 || /mayor a|>|superior a/i.test(neckMatch[0])) {
      mapped.neckLarge = "si";
      evidence.push({ field: "neckLarge", label: "Cuello >40cm", snippet: neckMatch[0] });
    }
  } else if (/cuello.*(mayor a|>|superior a)\s*40\s*cm/i.test(text)) {
    mapped.neckLarge = "si";
    evidence.push({ field: "neckLarge", label: "Cuello >40cm", snippet: findMatch(text, [/cuello[^.,;]*(mayor a|>|superior a)\s*40\s*cm[^.,;]*/i]) });
  }

  const pesoMatch = text.match(/peso[:\s]+(\d+(?:[.,]\d+)?)\s*kg/i);
  if (pesoMatch) { mapped.weight = parseFloat(pesoMatch[1].replace(",", ".")); evidence.push({ field: "weight", label: "Peso", snippet: pesoMatch[0] }); }
  const tallaMatch = text.match(/talla[:\s]+(\d+(?:[.,]\d+)?)\s*cm/i);
  if (tallaMatch) { mapped.height = parseFloat(tallaMatch[1].replace(",", ".")); evidence.push({ field: "height", label: "Talla", snippet: tallaMatch[0] }); }
  const cinturaMatch = text.match(/cintura[:\s]+(\d+(?:[.,]\d+)?)\s*cm/i);
  if (cinturaMatch) { mapped.waist = parseFloat(cinturaMatch[1].replace(",", ".")); evidence.push({ field: "waist", label: "Cintura", snippet: cinturaMatch[0] }); }

  const eossMention = /\bEOSS\b/i.test(text);

  if (Object.keys(mapped).length === 0) {
    return { ok: false, msg: "No reconocí ningún dato en el texto. Revisá que use la terminología habitual del HCOP." };
  }
  return { ok: true, mapped, evidence, eossMention };
}

function importFromHclabText(raw) {
  const clean = raw.replace(/\*\*/g, "");
  // separa por comas, cada segmento tipo "NOMBRE valor"
  const segments = clean.split(",");
  const mapped = {};
  const found = [];
  for (const seg of segments) {
    const m = seg.trim().match(/([A-Za-zÁÉÍÓÚáéíóúñÑ%]+)\s*[:\s]\s*([\d.,]+)/);
    if (!m) continue;
    const token = m[1].toUpperCase();
    const value = parseFloat(m[2].replace(",", "."));
    if (isNaN(value)) continue;
    for (const field in HCLAB_ALIASES) {
      if (HCLAB_ALIASES[field].includes(token)) {
        mapped[field] = value;
        found.push(`${token}=${value}`);
        break;
      }
    }
  }
  if (found.length === 0) {
    return { ok: false, msg: "No reconocí ningún parámetro. Revisá que las abreviaturas coincidan con la tabla acordada." };
  }
  return { ok: true, mapped, found };
}

/* ---------- PREVENT (AHA, coeficientes oficiales del paquete STATA v2024) ---------- */
/* Extraídos de prevent_beta10_2024.dta / prevent_beta30_2024.dta (modelo base, i=1).
   Transformaciones replicadas de aha_prevent_base.ado. Sexo: f=0 asumido varón, f=1 mujer
   (documentado en el paquete: "female should be coded as 1") — PENDIENTE de confirmar con
   casos de prueba contra la calculadora oficial antes de uso clínico. */

const PREVENT_COEF = {
  y10: {
    cvd_0: { age: 0.7688528, nhdl: 0.0736174, hdl: -0.0954431, sbp_1: -0.4347345, sbp_2: 0.3362658, dm: 0.7692857, smoke: 0.4386871, egfr_1: 0.5378979, egfr_2: 0.0164827, bptreat: 0.2888790, statin: -0.1337349, bptreat_x: -0.0475924, statin_x: 0.1502730, age_nhdl: -0.0517874, age_hdl: 0.0191169, age_sbp2: -0.1049477, age_dm: -0.2251948, age_smoke: -0.0895067, age_egfr1: -0.1543702, const: -3.0311680 },
    cvd_1: { age: 0.7939329, nhdl: 0.0305239, hdl: -0.1606857, sbp_1: -0.2394003, sbp_2: 0.3600781, dm: 0.8667604, smoke: 0.5360739, egfr_1: 0.6045917, egfr_2: 0.0433769, bptreat: 0.3151672, statin: -0.1477655, bptreat_x: -0.0663612, statin_x: 0.1197879, age_nhdl: -0.0819715, age_hdl: 0.0306769, age_sbp2: -0.0946348, age_dm: -0.2705700, age_smoke: -0.0787150, age_egfr1: -0.1637806, const: -3.3077280 },
    ascvd_0: { age: 0.7099847, nhdl: 0.1658663, hdl: -0.1144285, sbp_1: -0.2837212, sbp_2: 0.3239977, dm: 0.7189597, smoke: 0.3956973, egfr_1: 0.3690075, egfr_2: 0.0203619, bptreat: 0.2036522, statin: -0.0865581, bptreat_x: -0.0322916, statin_x: 0.1145630, age_nhdl: -0.0300005, age_hdl: 0.0232747, age_sbp2: -0.0927024, age_dm: -0.2018525, age_smoke: -0.0970527, age_egfr1: -0.1217081, const: -3.5006550 },
    ascvd_1: { age: 0.7198830, nhdl: 0.1176967, hdl: -0.1511850, sbp_1: -0.0835358, sbp_2: 0.3592852, dm: 0.8348585, smoke: 0.4831078, egfr_1: 0.4864619, egfr_2: 0.0397779, bptreat: 0.2265309, statin: -0.0592374, bptreat_x: -0.0395762, statin_x: 0.0844423, age_nhdl: -0.0567839, age_hdl: 0.0325692, age_sbp2: -0.1035985, age_dm: -0.2417542, age_smoke: -0.0791142, age_egfr1: -0.1671492, const: -3.8199750 },
  },
  y10hf: {
    hf_0: { age: 0.8972642, sbp_1: -0.6811466, sbp_2: 0.3634461, dm: 0.9237760, smoke: 0.5023736, bmi_1: -0.0485841, bmi_2: 0.3726929, egfr_1: 0.6926917, egfr_2: 0.0251827, bptreat: 0.2980922, bptreat_x: -0.0497731, age_sbp2: -0.1289201, age_dm: -0.3040924, age_smoke: -0.1401688, age_bmi2: 0.0068126, age_egfr1: -0.1797778, const: -3.9463910 },
    hf_1: { age: 0.8998235, sbp_1: -0.4559771, sbp_2: 0.3576505, dm: 1.0383460, smoke: 0.5839160, bmi_1: -0.0072294, bmi_2: 0.2997706, egfr_1: 0.7451638, egfr_2: 0.0557087, bptreat: 0.3534442, bptreat_x: -0.0981511, age_sbp2: -0.0946663, age_dm: -0.3581041, age_smoke: -0.1159453, age_bmi2: -0.0038780, age_egfr1: -0.1884289, const: -4.3104090 },
  },
  y30: {
    cvd_0: { age: 0.4627309, age2: -0.0984281, nhdl: 0.0836088, hdl: -0.1029824, sbp_1: -0.2140352, sbp_2: 0.2904325, dm: 0.5331276, smoke: 0.2141914, egfr_1: 0.1155556, egfr_2: 0.0603775, bptreat: 0.2327140, statin: -0.0272112, bptreat_x: -0.0384488, statin_x: 0.1341920, age_nhdl: -0.0511759, age_hdl: 0.0165865, age_sbp2: -0.1101437, age_dm: -0.2585943, age_smoke: -0.1566406, age_egfr1: -0.1166776, const: -1.1482040 },
    cvd_1: { age: 0.5503079, age2: -0.0928369, nhdl: 0.0409794, hdl: -0.1663306, sbp_1: -0.1628654, sbp_2: 0.3299505, dm: 0.6793894, smoke: 0.3196112, egfr_1: 0.1857101, egfr_2: 0.0553528, bptreat: 0.2894000, statin: -0.0756880, bptreat_x: -0.0563670, statin_x: 0.1071019, age_nhdl: -0.0751438, age_hdl: 0.0301786, age_sbp2: -0.0998776, age_dm: -0.3206166, age_smoke: -0.1607862, age_egfr1: -0.1450788, const: -1.3188270 },
    ascvd_0: { age: 0.3994099, age2: -0.0937484, nhdl: 0.1744643, hdl: -0.1202030, sbp_1: -0.0665117, sbp_2: 0.2753037, dm: 0.4790257, smoke: 0.1782635, egfr_1: -0.0218789, egfr_2: 0.0602553, bptreat: 0.1421182, statin: 0.0135996, bptreat_x: -0.0218265, statin_x: 0.1013148, age_nhdl: -0.0312619, age_hdl: 0.0206730, age_sbp2: -0.0920935, age_dm: -0.2159947, age_smoke: -0.1548811, age_egfr1: -0.0712547, const: -1.7364440 },
    ascvd_1: { age: 0.4669202, age2: -0.0893118, nhdl: 0.1256901, hdl: -0.1542255, sbp_1: -0.0018093, sbp_2: 0.3229490, dm: 0.6296707, smoke: 0.2682920, egfr_1: 0.1001060, egfr_2: 0.0499663, bptreat: 0.1875292, statin: 0.0152476, bptreat_x: -0.0276123, statin_x: 0.0736147, age_nhdl: -0.0521962, age_hdl: 0.0316918, age_sbp2: -0.1046101, age_dm: -0.2727793, age_smoke: -0.1530907, age_egfr1: -0.1299149, const: -1.9740740 },
  },
  y30hf: {
    hf_0: { age: 0.5681541, age2: -0.1048388, sbp_1: -0.4761564, sbp_2: 0.3032400, dm: 0.6840338, smoke: 0.2656273, bmi_1: 0.0833107, bmi_2: 0.2699900, egfr_1: 0.2541805, egfr_2: 0.0638923, bptreat: 0.2583631, bptreat_x: -0.0391938, age_sbp2: -0.1269124, age_dm: -0.3273572, age_smoke: -0.2043019, age_bmi2: -0.0182831, age_egfr1: -0.1342618, const: -1.9575100 },
    hf_1: { age: 0.6254374, age2: -0.0983038, sbp_1: -0.3919241, sbp_2: 0.3142295, dm: 0.8330787, smoke: 0.3438651, bmi_1: 0.0594874, bmi_2: 0.2525536, egfr_1: 0.2981642, egfr_2: 0.0667159, bptreat: 0.3339210, bptreat_x: -0.0893177, age_sbp2: -0.0974299, age_dm: -0.4048550, age_smoke: -0.1982991, age_bmi2: -0.0035619, age_egfr1: -0.1564215, const: -2.2053790 },
  },
};

/* eGFR sin creatinina disponible en el modelo PREVENT: se usa el eGFR CKD-EPI 2021 ya calculado en el panel */
function preventTransform(d) {
  const age = num(d.age);
  const sbpRaw = num(d.sbp);
  const bmiRaw = bmiOf(d);
  const egfr = egfrOf(d);
  const tcRaw = num(d.totalChol), hdlRaw = num(d.hdl);
  if (![age, sbpRaw, bmiRaw, egfr, tcRaw, hdlRaw].every(has)) return null;

  const ageT = (age - 55) / 10;
  const sbpT = (sbpRaw - 110) / 20;
  const sbp_1 = Math.min(sbpT, 0);
  const sbp_2 = Math.max(sbpT, 0) - 1;
  const bptreat = d.onAntihtn === "si" ? 1 : 0;
  const bptreat_x = sbp_2 * bptreat;

  const tcMmol = tcRaw * 0.02586, hdlMmol = hdlRaw * 0.02586;
  const nhdl = tcMmol - hdlMmol - 3.5;
  const statin = d.onStatin === "si" ? 1 : 0;
  const statin_x = nhdl * statin;
  const hdlT = (hdlMmol - 1.3) / 0.3;

  const dm = d.dm === "si" ? 1 : 0;
  const smoke = d.smoker === "si" ? 1 : 0;

  const egfr_1 = -Math.min(egfr, 60) / 15 + 4;
  const egfr_2 = -Math.max(egfr, 60) / 15 + 6;

  const bmiT = (bmiRaw - 25) / 5;
  const bmi_1 = Math.min(bmiT, 1);
  const bmi_2 = Math.max(bmiT, 1) - 1;

  return { ageT, nhdl, hdlT, sbp_1, sbp_2, dm, smoke, egfr_1, egfr_2, bptreat, statin, bptreat_x, statin_x, bmi_1, bmi_2, ageRaw: age };
}

function preventBaseVal(name, t) {
  if (name === "hdl") return t.hdlT;
  if (name === "sbp2") return t.sbp_2;
  if (name === "bmi2") return t.bmi_2;
  if (name === "egfr1") return t.egfr_1;
  return t[name];
}
function preventLinPred(coef, t) {
  let xb = 0;
  for (const key in coef) {
    const v = coef[key];
    if (v === undefined || Number.isNaN(v)) continue;
    if (key === "const") xb += v;
    else if (key === "age") xb += v * t.ageT;
    else if (key === "age2") xb += v * (t.ageT * t.ageT);
    else if (key.startsWith("age_")) xb += v * preventBaseVal(key.slice(4), t) * t.ageT;
    else xb += v * (t[key] !== undefined ? t[key] : preventBaseVal(key, t));
  }
  return xb;
}
function toRiskPct(xb) {
  return (Math.exp(xb) / (Math.exp(xb) + 1)) * 100;
}

function importFromLabJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, msg: "JSON inválido — revisá que sea el documento completo de la muestra." };
  }
  // Acepta: un objeto muestra, un array de muestras, o { muestras: [...] }
  let samples = [];
  if (Array.isArray(parsed)) samples = parsed;
  else if (parsed.muestras && Array.isArray(parsed.muestras)) samples = parsed.muestras;
  else samples = [parsed];

  if (samples.length === 0) return { ok: false, msg: "No se encontraron muestras en el JSON." };

  // Toma la más reciente por fecha/timestamp
  samples.sort((a, b) => {
    const ta = a.timestamp || new Date(a.fecha || 0).getTime();
    const tb = b.timestamp || new Date(b.fecha || 0).getTime();
    return tb - ta;
  });
  const sample = samples[0];
  const params = sample.parametros || {};

  const mapped = {};
  const found = [];
  const ignored = [];
  for (const key in params) {
    if (key.startsWith("_label_")) continue;
    if (LAB_KEY_MAP[key]) {
      mapped[LAB_KEY_MAP[key]] = params[key];
      found.push(key);
    } else {
      ignored.push(key);
    }
  }
  return { ok: true, mapped, found, ignored, fecha: sample.fecha, count: samples.length };
}

export default function App() {
  const [data, setData] = useState({});
  const [active, setActive] = useState(null);
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState([]);
  const [status, setStatus] = useState("");
  const [showList, setShowList] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCollision, setShowCollision] = useState(false);
  const [collisionInfo, setCollisionInfo] = useState(null);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importMode, setImportMode] = useState("hclab");
  const set = (k) => (v) => setData((d) => ({ ...d, [k]: v }));

  const runImport = () => {
    const r =
      importMode === "hclab" ? importFromHclabText(importText) :
      importMode === "hcop" ? parseHcopCombined(importText) :
      importFromLabJson(importText);
    if (importMode === "hcop") {
      const foundCode = extractCodeFromText(importText);
      if (foundCode) {
        if (!code.trim()) {
          setCode(foundCode);
          r.codeStatus = `Código detectado y cargado: ${foundCode}`;
        } else if (foundCode !== code.trim()) {
          r.codeStatus = `El texto trae el código ${foundCode}, distinto al que ya tenías escrito (${code.trim()}) — no lo pisé, revisá cuál corresponde.`;
        } else {
          r.codeStatus = `Código ${foundCode} coincide con el ya cargado.`;
        }
      }
    }
    if (!r.ok) {
      setImportResult(r);
      return;
    }
    setData((d) => ({ ...d, ...r.mapped }));
    setImportResult(r);
  };

  const refreshList = async () => {
    try {
      const r = await window.storage.list("record:", false);
      setSavedCodes(r ? r.keys.map((k) => k.replace("record:", "")) : []);
    } catch (e) {
      setSavedCodes([]);
    }
  };

  const doWriteRecord = async () => {
    setStatus("Guardando…");
    try {
      const record = {
        code: code.trim(),
        savedAt: new Date().toISOString(),
        data,
        results: evaluated
          .filter((s) => s.complete)
          .map((s) => ({ id: s.id, name: s.name, value: s.result.value, unit: s.result.unit, read: s.result.read })),
      };
      const r = await window.storage.set(`record:${code.trim()}`, JSON.stringify(record), false);
      setStatus(r ? "Guardado." : "No se pudo guardar.");
      refreshList();
    } catch (e) {
      setStatus("Error al guardar.");
    }
  };

  const saveRecord = async () => {
    if (!code.trim()) {
      setStatus("Ingresá un código antes de guardar.");
      return;
    }
    setStatus("Verificando código…");
    try {
      const existing = await window.storage.get(`record:${code.trim()}`, false);
      if (existing && existing.value) {
        const prev = JSON.parse(existing.value);
        setCollisionInfo({ savedAt: prev.savedAt });
        setShowCollision(true);
        setStatus("");
        return; // no se guarda hasta que confirmes
      }
    } catch (e) {
      // no existe el código todavía: sin colisión, se guarda directo
    }
    doWriteRecord();
  };

  const loadRecord = async (c) => {
    setStatus("Cargando…");
    try {
      const r = await window.storage.get(`record:${c}`, false);
      if (r && r.value) {
        const record = JSON.parse(r.value);
        setData(record.data || {});
        setCode(record.code || c);
        setStatus(`Cargado — última carga ${new Date(record.savedAt).toLocaleDateString()}`);
      }
    } catch (e) {
      setStatus("No se encontró ese código.");
    }
    setShowList(false);
  };

  const exportAll = async () => {
    setStatus("Exportando…");
    try {
      const r = await window.storage.list("record:", false);
      const keys = r ? r.keys : [];
      const all = [];
      for (const k of keys) {
        try {
          const rec = await window.storage.get(k, false);
          if (rec && rec.value) all.push(JSON.parse(rec.value));
        } catch (e) {}
      }
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "registros_riesgo_cardiometabolico.json";
      a.click();
      setStatus(`Exportados ${all.length} registro(s).`);
    } catch (e) {
      setStatus("Error al exportar.");
    }
  };

  const evaluated = useMemo(() => {
    return SCORES.map((s) => {
      const missing = s.required.filter((f) => !hasVal(data[f]));
      const complete = missing.length === 0;
      let result = null;
      if (complete) {
        try {
          result = s.calc(data);
        } catch (e) {
          result = { value: "err", unit: "", read: "Error de cálculo — revisar datos ingresados." };
        }
      }
      return { ...s, missing, complete, result };
    });
  }, [data]);

  const groups = ["Cardio", "Renal", "Hepático", "Metabólico", "Sueño", "Obesidad"];

  return (
    <div className="min-h-full w-full font-sans" style={{ background: '#0D1017', color: '#E7EAF0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        .font-sans { font-family: 'Inter', system-ui, sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <div className="max-w-6xl mx-auto px-5 py-6">
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: '#5B6478' }}>Prototipo — datos de prueba, no persisten</div>
          <h1 className="text-xl font-semibold" style={{ color: '#E7EAF0' }}>Panel de riesgo cardiometabólico</h1>
          <p className="text-sm mt-1" style={{ color: '#8B93A7' }}>Cargá los datos disponibles. Cada score se activa solo cuando tiene todos los parámetros que necesita.</p>
        </div>

        {/* Barra de código / persistencia */}
        <div className="mb-5 border rounded-lg p-3 flex flex-wrap items-center gap-2" style={{ borderColor: '#232A38', background: '#161B24' }}>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: '#5B6478' }}>Código</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ej. 974JCG0"
            className="border rounded px-2 py-1.5 text-sm font-mono w-40 focus:outline-none focus:border-[#5B8DEF]" style={{ background: '#1A1F29', borderColor: '#2A3140' }}
          />
          <button onClick={saveRecord} className="text-xs px-3 py-1.5 rounded font-semibold" style={{ background: '#5B8DEF', color: '#0D1017' }}>Guardar</button>
          <button
            onClick={() => { setShowList(true); refreshList(); }}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#2A3140', color: '#C7CDDB' }}
          >
            Cargar código guardado
          </button>
          <button
            onClick={() => { setShowImport(true); setImportResult(null); setImportText(""); setImportMode("hclab"); }}
            className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#2A3140', color: '#C7CDDB' }}
          >
            Importar laboratorio
          </button>
          <button onClick={exportAll} className="text-xs px-3 py-1.5 rounded border" style={{ borderColor: '#2A3140', color: '#C7CDDB' }}>
            Exportar todo (JSON)
          </button>
          {code.trim() && (
            <input
              readOnly
              onFocus={(e) => e.target.select()}
              value={`— Código: ${code.trim()} —`}
              className="ml-auto border rounded px-2 py-1.5 text-xs font-mono w-72" style={{ background: '#0D1017', borderColor: '#2A3140', color: '#8B93A7' }}
              title="Seleccioná y copiá para pegar en el HCOP"
            />
          )}
          {status && <span className="text-[11px] w-full" style={{ color: '#5B6478' }}>{status}</span>}
        </div>

        {showCollision && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowCollision(false)}>
            <div className="border rounded-xl max-w-sm w-full p-5" style={{ background: '#161B24', borderColor: '#C98A3E' }} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: '#C98A3E' }}>Código ya existente</h3>
              <p className="text-sm mb-3" style={{ color: '#C7CDDB' }}>
                Ya hay un registro guardado con el código <strong>{code.trim()}</strong>
                {collisionInfo && `, del ${new Date(collisionInfo.savedAt).toLocaleDateString()}`}.
              </p>
              <p className="text-xs mb-4" style={{ color: '#8B93A7' }}>
                ¿Es el mismo paciente (otra visita) o son personas distintas con el mismo código? Si son distintas, cancelá y subí el dígito de desambiguación antes de guardar de nuevo.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCollision(false); doWriteRecord(); }}
                  className="text-xs px-3 py-1.5 rounded font-semibold"
                  style={{ background: '#C98A3E', color: '#0D1017' }}
                >
                  Es el mismo paciente — actualizar
                </button>
                <button
                  onClick={() => setShowCollision(false)}
                  className="text-xs px-3 py-1.5 rounded border"
                  style={{ borderColor: '#2A3140', color: '#C7CDDB' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {showImport && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowImport(false)}>
            <div className="border rounded-xl max-w-lg w-full p-5" style={{ background: '#161B24', borderColor: '#2A3140' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Importar laboratorio</h3>
                <button onClick={() => setShowImport(false)} className="text-sm" style={{ color: '#5B6478' }}>Cerrar</button>
              </div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { setImportMode("hclab"); setImportResult(null); }}
                  className="text-xs px-3 py-1 rounded"
                  style={importMode === "hclab" ? { background: "#5B8DEF", color: "#0D1017" } : { border: "1px solid #2A3140", color: "#8B93A7" }}
                >
                  Texto HCLAB
                </button>
                <button
                  onClick={() => { setImportMode("json"); setImportResult(null); }}
                  className="text-xs px-3 py-1 rounded"
                  style={importMode === "json" ? { background: "#5B8DEF", color: "#0D1017" } : { border: "1px solid #2A3140", color: "#8B93A7" }}
                >
                  Monitor Laboratorio (JSON, Argerich)
                </button>
                <button
                  onClick={() => { setImportMode("hcop"); setImportResult(null); }}
                  className="text-xs px-3 py-1 rounded"
                  style={importMode === "hcop" ? { background: "#5B8DEF", color: "#0D1017" } : { border: "1px solid #2A3140", color: "#8B93A7" }}
                >
                  Texto HCOP
                </button>
              </div>
              <p className="text-xs mb-2" style={{ color: '#8B93A7' }}>
                {importMode === "hclab"
                  ? 'Pegá la línea de HCLAB tal cual te la genero en el chat (ej. "GOT 22, GPT 18, PLAQ 230, CR 0,9, TG 140, GLU 95, COL 190, HDL 42"). El texto en negrita se ignora, no afecta el parseo.'
                  : importMode === "hcop"
                  ? "Pegá el texto del HCOP (prosa, el bloque técnico CAMPO=VALOR, o ambos). El bloque CAMPO=VALOR se matchea literal, sin heurística, y pisa cualquier coincidencia por palabra clave del mismo campo. EOSS nunca se autocompleta."
                  : 'Pegá el documento JSON de la muestra (colección "muestras" de Firestore) o un array de muestras — se toma la más reciente. El nombre del paciente se descarta, nunca se guarda acá.'}
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={6}
                placeholder={importMode === "hclab" ? "GOT 22, GPT 18, PLAQ 230, CR 0,9, TG 140, GLU 95, COL 190, HDL 42" : importMode === "hcop" ? "Consultante de 58 años, sexo femenino, con FRCV HTA, DBT tipo 2, tabaquista..." : '{"paciente":"...", "fecha":"2026-08-10", "parametros":{"AST_TGO":22, "Creatinina":0.9, ...}}'}
                className="w-full border rounded px-2 py-2 text-xs font-mono focus:outline-none focus:border-[#5B8DEF]" style={{ background: '#0D1017', borderColor: '#2A3140', color: '#C7CDDB' }}
              />
              <button onClick={runImport} className="mt-2 text-xs px-3 py-1.5 rounded font-semibold" style={{ background: '#5B8DEF', color: '#0D1017' }}>
                Mapear e importar
              </button>
              {importResult && (
                <div className="mt-3 text-xs">
                  {!importResult.ok ? (
                    <div>
                      <div style={{ color: '#D9714E' }}>{importResult.msg}</div>
                      {importResult.codeStatus && <div className="mt-1" style={{ color: '#8B93A7' }}>{importResult.codeStatus}</div>}
                    </div>
                  ) : importMode === "hclab" ? (
                    <div className="" style={{ color: '#5FA35A' }}>Importados: {importResult.found.join(", ")}</div>
                  ) : importMode === "hcop" ? (
                    <div>
                      <div style={{ color: '#5FA35A' }} className="mb-1">Se completaron {importResult.evidence.length} campo(s):</div>
                      <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                        {importResult.evidence.map((e, i) => (
                          <li key={i}>
                            <span style={{ color: '#E7EAF0' }}>{e.label}</span>
                            <span style={{ color: '#5B6478' }}> — "{e.snippet}"</span>
                            {e.literal && <span style={{ color: '#5B8DEF' }}> · literal</span>}
                          </li>
                        ))}
                      </ul>
                      {importResult.codeStatus && (
                        <div className="mt-2" style={{ color: '#5B8DEF' }}>{importResult.codeStatus}</div>
                      )}
                      {importResult.eossMention && (
                        <div className="mt-2" style={{ color: '#C98A3E' }}>Se menciona "EOSS" en el texto — revisá y elegí los 3 dominios manualmente en Obesidad, no se autocompletan.</div>
                      )}
                    </div>
                  ) : (
                    <div className="" style={{ color: '#8B93A7' }}>
                      <div>Muestra del {importResult.fecha || "s/fecha"} ({importResult.count} encontrada{importResult.count !== 1 ? "s" : ""} en el JSON, se tomó la más reciente).</div>
                      <div className="mt-1" style={{ color: '#5FA35A' }}>Mapeados: {importResult.found.length ? importResult.found.join(", ") : "ninguno"}</div>
                      {importResult.ignored.length > 0 && (
                        <div className="mt-1" style={{ color: '#5B6478' }}>Sin mapeo todavía (no afectan scores actuales): {importResult.ignored.join(", ")}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showList && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setShowList(false)}>
            <div className="border rounded-xl max-w-sm w-full p-5" style={{ background: '#161B24', borderColor: '#2A3140' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Códigos guardados</h3>
                <button onClick={() => setShowList(false)} className="text-sm" style={{ color: '#5B6478' }}>Cerrar</button>
              </div>
              {savedCodes.length === 0 ? (
                <div className="text-sm" style={{ color: '#5B6478' }}>Todavía no hay registros guardados.</div>
              ) : (
                <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                  {savedCodes.map((c) => (
                    <li key={c}>
                      <button
                        onClick={() => loadRecord(c)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-[#1A1F29] text-sm font-mono" style={{ color: '#E7EAF0' }}
                      >
                        {c}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
          {/* Panel de datos */}
          <div className="flex flex-col gap-3">
            <Section title="Demográficos">
              <Field label="Edad"><NumInput value={data.age || ""} onChange={set("age")} /></Field>
              <Field label="Sexo"><SexSelect value={data.sex || ""} onChange={set("sex")} /></Field>
            </Section>

            <Section title="Laboratorio" defaultOpen={true}>
              <Field label="AST/GOT"><NumInput value={data.ast || ""} onChange={set("ast")} /></Field>
              <Field label="ALT/GPT"><NumInput value={data.alt || ""} onChange={set("alt")} /></Field>
              <Field label="Plaquetas"><NumInput value={data.platelets || ""} onChange={set("platelets")} /></Field>
              <Field label="Creatinina"><NumInput value={data.creatinine || ""} onChange={set("creatinine")} /></Field>
              <Field label="UACR (mg/g)"><NumInput value={data.uacr || ""} onChange={set("uacr")} /></Field>
              <Field label="Triglicéridos"><NumInput value={data.tgs || ""} onChange={set("tgs")} /></Field>
              <Field label="Glucemia"><NumInput value={data.glucose || ""} onChange={set("glucose")} /></Field>
              <Field label="Col. total"><NumInput value={data.totalChol || ""} onChange={set("totalChol")} /></Field>
              <Field label="HDL"><NumInput value={data.hdl || ""} onChange={set("hdl")} /></Field>
            </Section>

            <Section title="Antecedentes / vitales" defaultOpen={false}>
              <Field label="HTA"><TriSelect value={data.htn || ""} onChange={set("htn")} /></Field>
              <Field label="Diabetes"><TriSelect value={data.dm || ""} onChange={set("dm")} /></Field>
              <Field label="Disglucemia (prediabetes)"><TriSelect value={data.disglucemia || ""} onChange={set("disglucemia")} /></Field>
              <Field label="ACV/AIT previo"><TriSelect value={data.stroke || ""} onChange={set("stroke")} /></Field>
              <Field label="Enf. vascular"><TriSelect value={data.vascular || ""} onChange={set("vascular")} /></Field>
              <Field label="Insuf. cardíaca"><TriSelect value={data.chf || ""} onChange={set("chf")} /></Field>
              <Field label="Tabaquismo"><TriSelect value={data.smoker || ""} onChange={set("smoker")} /></Field>
              <Field label="Estatina actual"><TriSelect value={data.onStatin || ""} onChange={set("onStatin")} /></Field>
              <Field label="Antihipertensivo"><TriSelect value={data.onAntihtn || ""} onChange={set("onAntihtn")} /></Field>
              <Field label="Anticoagulación"><TriSelect value={data.anticoag || ""} onChange={set("anticoag")} /></Field>
              <Field label="TA sistólica"><NumInput value={data.sbp || ""} onChange={set("sbp")} /></Field>
            </Section>

            <Section title="Antecedentes gineco-obstétricos" defaultOpen={false}>
              <Field label="Menopausia precoz/temprana"><TriSelect value={data.menopausiaPrecoz || ""} onChange={set("menopausiaPrecoz")} /></Field>
              <Field label="HTA gestacional"><TriSelect value={data.htaGestacional || ""} onChange={set("htaGestacional")} /></Field>
              <Field label="DBT gestacional"><TriSelect value={data.dbtGestacional || ""} onChange={set("dbtGestacional")} /></Field>
              <Field label="Hijo/s bajo peso al nacer"><TriSelect value={data.bajoPesoNacer || ""} onChange={set("bajoPesoNacer")} /></Field>
              <Field label="Abortos espontáneos"><TriSelect value={data.abortosEspontaneos || ""} onChange={set("abortosEspontaneos")} /></Field>
              <Field label="Tratamiento estrogénico"><TriSelect value={data.tratamientoEstrogenico || ""} onChange={set("tratamientoEstrogenico")} /></Field>
            </Section>

            <Section title="Sueño (STOP-BANG)" defaultOpen={false}>
              <Field label="Ronquido"><TriSelect value={data.snoring || ""} onChange={set("snoring")} /></Field>
              <Field label="Cansancio diurno"><TriSelect value={data.tiredness || ""} onChange={set("tiredness")} /></Field>
              <Field label="Apnea observada"><TriSelect value={data.observedApnea || ""} onChange={set("observedApnea")} /></Field>
              <Field label="Cuello >40cm"><TriSelect value={data.neckLarge || ""} onChange={set("neckLarge")} /></Field>
            </Section>

            <Section title="Obesidad (a demanda)" defaultOpen={false}>
              <Field label="Peso (kg)"><NumInput value={data.weight || ""} onChange={set("weight")} /></Field>
              <Field label="Talla (cm)"><NumInput value={data.height || ""} onChange={set("height")} /></Field>
              <Field label="Cintura (cm)"><NumInput value={data.waist || ""} onChange={set("waist")} /></Field>
              <div className="col-span-2 border-t pt-2 mt-1" style={{ borderColor: '#232A38' }}>
                <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: '#5B6478' }}>EOSS — criterio clínico por dominio</div>
              </div>
              <Field label="Factores de riesgo asociados">
                <DomainSelect
                  value={data.eossRisk || ""}
                  onChange={set("eossRisk")}
                  anchors={["Ninguno", "Subclínico (HTA/glucemia límite)", "Establecido (HTA, DM2, apnea)", "Significativo (daño de órgano blanco)", "Severo (potencialmente terminal)"]}
                />
              </Field>
              <Field label="Limitación funcional">
                <DomainSelect
                  value={data.eossFunction || ""}
                  onChange={set("eossFunction")}
                  anchors={["Ninguna", "Leve (disnea/fatiga ocasional)", "Moderada (limita actividad diaria)", "Significativa (no puede trabajar)", "Severa (incapacitante)"]}
                />
              </Field>
              <Field label="Síntomas psicológicos">
                <DomainSelect
                  value={data.eossPsych || ""}
                  onChange={set("eossPsych")}
                  anchors={["Ninguno", "Leve (bienestar afectado)", "Moderado (ansiedad/depresión)", "Significativo (depresión mayor/ideación)", "Severo (incapacitante)"]}
                />
              </Field>
            </Section>
          </div>

          {/* Tablero de scores */}
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {evaluated.map((s) => {
                const color = GROUP_COLOR[s.group];
                const pending = (s.engineStatus === "pending" || s.engineStatus === "unvalidated") && s.complete;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s)}
                    className="text-left rounded-lg p-3 border transition-all"
                    style={
                      s.complete
                        ? pending
                          ? { background: "#1A1F29", borderColor: "#C98A3E", borderStyle: "dashed" }
                          : { background: color, borderColor: color }
                        : { background: "#12161E", borderColor: "#232A38" }
                    }
                  >
                    <div
                      className="text-[10px] uppercase tracking-wide mb-1"
                      style={{ color: s.complete && !pending ? "rgba(255,255,255,0.75)" : "#5B6478" }}
                    >
                      {s.group}
                    </div>
                    <div
                      className="text-sm font-semibold"
                      style={{ color: s.complete && !pending ? "#0D1017" : "#8B93A7" }}
                    >
                      {s.name}
                    </div>
                    {!s.complete && (
                      <div className="text-[11px] mt-1" style={{ color: '#5B6478' }}>
                        Falta {s.missing.length} dato{s.missing.length !== 1 ? "s" : ""}
                      </div>
                    )}
                    {s.complete && pending && (
                      <div className="mt-1">
                        {s.engineStatus === "unvalidated" ? (
                          <>
                            <div className="text-lg font-mono font-semibold" style={{ color: "#C98A3E" }}>
                              {s.result.value} <span className="text-xs">{s.result.unit}</span>
                            </div>
                            <div className="text-[10px]" style={{ color: '#C98A3E' }}>No validado — ver detalle</div>
                          </>
                        ) : (
                          <div className="text-[11px]" style={{ color: '#C98A3E' }}>Datos OK — motor pendiente</div>
                        )}
                      </div>
                    )}
                    {s.complete && !pending && (
                      <div className="text-lg font-mono font-semibold mt-1" style={{ color: "#0D1017" }}>
                        {s.result.value} <span className="text-xs">{s.result.unit}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Panel de detalle */}
      {active && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center p-4 z-50"
          onClick={() => setActive(null)}
        >
          <div
            className="border rounded-xl max-w-md w-full p-5" style={{ background: '#161B24', borderColor: '#2A3140' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: GROUP_COLOR[active.group] }}>
                {active.group}
              </div>
              <button onClick={() => setActive(null)} className="text-sm" style={{ color: '#5B6478' }}>Cerrar</button>
            </div>
            <h2 className="text-lg font-semibold mb-3">{active.name}</h2>

            {!active.complete ? (
              <div>
                <div className="text-sm mb-2" style={{ color: '#8B93A7' }}>Faltan estos parámetros para calcularlo:</div>
                <ul className="flex flex-col gap-1">
                  {active.missing.map((f) => (
                    <li key={f} className="text-sm flex items-center gap-2" style={{ color: '#E7EAF0' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#C98A3E' }} />
                      {FIELD_LABELS[f] || f}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>
                {active.engineStatus !== "pending" && (
                  <div className="font-mono text-3xl font-semibold mb-2" style={{ color: GROUP_COLOR[active.group] }}>
                    {active.result.value} <span className="text-base" style={{ color: '#8B93A7' }}>{active.result.unit}</span>
                  </div>
                )}
                <div className="text-sm leading-relaxed" style={{ color: '#C7CDDB' }}>{active.result.read}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
