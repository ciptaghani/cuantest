/**
 * Menjalankan fungsi asli dari reference/cuan-lens.html di sandbox Node (vm), tanpa DOM,
 * supaya hasil port TypeScript bisa dibandingkan langsung dengan "spesifikasi hidup".
 *
 * Cara kerja: script HTML dipecah per deklarasi top-level (baris yang dimulai `function`,
 * `const`, `let`, `async function` di kolom 0). Hanya deklarasi yang dibutuhkan yang dijalankan.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HTML_PATH = fileURLToPath(new URL('../../reference/cuan-lens.html', import.meta.url));

type Block = { name: string; start: number; src: string };

function splitBlocks(script: string): Block[] {
  const lines = script.split('\n');
  const starts: { name: string; line: number }[] = [];
  lines.forEach((ln, i) => {
    const m = ln.match(/^(?:async\s+)?function\s+([\w$]+)/) || ln.match(/^(?:const|let)\s+([\w$]+)\s*=/) || ln.match(/^let\s+([\w$]+)/);
    if (m) starts.push({ name: m[1], line: i });
    else if (/^[A-Za-z$(/]/.test(ln)) starts.push({ name: '', line: i }); // statement lain: pembatas blok
  });
  return starts.map((s, i) => ({
    name: s.name,
    start: s.line,
    src: lines.slice(s.line, i + 1 < starts.length ? starts[i + 1].line : lines.length).join('\n'),
  }));
}

let cachedBlocks: Map<string, Block> | null = null;
function blocks(): Map<string, Block> {
  if (cachedBlocks) return cachedBlocks;
  const html = readFileSync(HTML_PATH, 'utf8');
  const i = html.indexOf('<script>\n');
  const j = html.lastIndexOf('</script>');
  const script = html.slice(i + '<script>\n'.length, j);
  cachedBlocks = new Map();
  for (const b of splitBlocks(script)) if (b.name && !cachedBlocks.has(b.name)) cachedBlocks.set(b.name, b);
  return cachedBlocks;
}

/** Deklarasi HTML yang dimuat ke sandbox. */
const NEEDED = [
  // utils
  'NF', 'rp', 'rpS', 'pc', 'xx', 'esc', 'pad', 'dk', 'addDays', 'daysBetween', 'num', 'parseTs', 'norm', 'toks', 'CANCEL',
  // marketplace
  'COMPS', 'CK', 'MP', 'KEY', 'DEF_FEES', 'BRANDS', 'S', 'UI', 'clone', 'okey', 'bestCat', 'autoMatchAll', 'adCat', 'RATES',
  'learnRates', 'feeOf', 'storeMap', 'filteredStores', 'dataRange', 'currentRange', 'enrich', 'agg', 'addLine', 'fin', 'overlap', 'compute',
  'short', 'autoMap', 'fdate',
  // ops
  'OP', 'uidGen', 'opModel', 'DEF_WH', 'whName', 'whOpts', 'stockCalcWh', 'stockCalc', 'avgDaily', 'hppCalc', 'ceil', 'taskRows', 'PRIO',
  'skuLbl', 'opts', 'brandsOf', 'n0', 'kpi', 'decantsOf', 'geserTargets', 'convRatio', 'mutasiWh', 'mutasi', 'pgAge', 'opPushSales',
  // cs
  'csVariants', 'csSearch',
  // finance
  'FIN_C', 'DEF_COA', 'TYPE_L', 'DEBIT_T', 'FN', 'finDocs', 'finCfg', 'finStores', 'r0', 'coa', 'accName', 'invTotals', 'invPaid',
  'bebanRest', 'overlapDays', 'finLedger', 'glAgg', 'sgn', 'finRange', 'periodBar', 'payCalc', 'fnPL', 'n2', 'fnCF', 'fnSt', 'fnRs',
  // marketing
  'MK', 'mkCompute', 'mkRanges', 'roasOf', 'mkAdvice', 'SEVR', 'adsAction', 'adsWeekly', 'planSuggest', 'BCG',
];

/** Sisipan untuk mengambil data dari fungsi render yang hanya mengembalikan HTML. */
const PATCHES: Record<string, [string, string][]> = {
  pgAge: [['const cnt=k=>', 'globalThis.__out.age={rows,span};const cnt=k=>']],
  fnSt: [['let list=', 'globalThis.__out.st={all,inP,un,late,per,noDate};let list=']],
  fnPL: [['const T=(l,v,cls=', 'globalThis.__out.pl={P,H,B,PL,BL,kotor,op,non,net};const T=(l,v,cls=']],
  fnCF: [['const wallets=', 'globalThis.__out.cf={open,end,O:O.tot,I:I.tot,F:F.tot,drift,cat};const wallets=']],
};

export interface HtmlState {
  /** state Marketplace (localStorage cuanlens-v2) */
  S: unknown;
  /** dokumen database artifact (ops/…, prod/…, fin/…) */
  docs: Record<string, unknown>;
  today: string;
}

export interface HtmlRuntime {
  call<T = unknown>(expr: string): T;
  out: Record<string, unknown>;
}

/** Buat sandbox baru berisi fungsi HTML dengan state tertentu. */
export function loadHtml(state: HtmlState): HtmlRuntime {
  const B = blocks();
  const parts: string[] = [];
  for (const n of NEEDED) {
    const b = B.get(n);
    if (!b) throw new Error(`Deklarasi "${n}" tidak ditemukan di reference/cuan-lens.html`);
    let src = b.src;
    for (const [from, to] of PATCHES[n] || []) {
      if (!src.includes(from)) throw new Error(`Patch untuk ${n} tidak cocok: ${from}`);
      src = src.replace(from, to);
    }
    parts.push(src);
  }
  const ordered = parts; // urutan NEEDED cukup: fungsi di-hoist, const hanya dipakai saat dipanggil
  const sandbox: Record<string, unknown> = {
    __out: {} as Record<string, unknown>,
    __state: JSON.parse(JSON.stringify(state)),
    console,
  };
  const ctx = vm.createContext(sandbox);
  const code = `
    const todayK=()=>__state.today;
    function toast(){}
    async function opWrite(kind,path,data){__out.writes=__out.writes||{};__out.writes[path]=JSON.parse(JSON.stringify(data));}
    ${ordered.join('\n')}
    S=__state.S; for(const k of ['cats','ofee','adMap'])if(!S[k])S[k]={}; if(S.target==null)S.target=12;
    OP.docs=__state.docs; OP.ready=true; OP.mode='local'; OP.isAdmin=true; OP._m=null; FN._L=null;
    globalThis.__eval=(e)=>eval(e);
  `;
  vm.runInContext(code, ctx, { filename: 'cuan-lens.html' });
  const evalFn = sandbox.__eval as (e: string) => unknown;
  return {
    call: <T>(expr: string) => evalFn(expr) as T,
    out: sandbox.__out as Record<string, unknown>,
  };
}

/** Salin hasil dari realm vm ke realm tes (Set → array, NaN/Infinity tetap). */
export function plain<T>(v: unknown): T {
  const seen = new WeakMap<object, unknown>();
  const go = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') return x;
    if (seen.has(x)) return seen.get(x);
    if (x instanceof Set || Object.prototype.toString.call(x) === '[object Set]') return [...(x as Set<unknown>)].map(go);
    if (Array.isArray(x)) {
      const a: unknown[] = [];
      seen.set(x, a);
      for (const y of x) a.push(go(y));
      return a;
    }
    const o: Record<string, unknown> = {};
    seen.set(x, o);
    for (const k of Object.keys(x)) o[k] = go((x as Record<string, unknown>)[k]);
    return o;
  };
  return go(v) as T;
}
