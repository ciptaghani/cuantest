import {
  DEFAULT_SHRINK_PCT,
  DEFAULT_TARGET_DAYS,
  variantKey,
  type ConversionRule,
  type Movement,
  type Opname,
  type OpsInput,
  type OpsSkuRow,
} from './types';

export interface OpsModel extends OpsInput {
  skuMap: Record<string, OpsSkuRow>;
  /** Sumber fullsize per varian (otomatis + override). */
  mainSrc: Record<string, string>;
  autoSrc: Record<string, string>;
  /** Jumlah ukuran fullsize per varian. */
  fsCount: Record<string, number>;
  /** Pecahan susut (0.95). */
  yieldFrac: number;
  targetDays: number;
  ruleFor: (brand: string, fromMl: number, toMl: number) => ConversionRule | null;
  /** Aturan untuk biaya kemasan: aturan persis, atau aturan brand dengan ukuran tujuan sama yang punya kemasan. */
  packRule: (brand: string, fromMl: number, toMl: number) => ConversionRule | null;
  ratio: (brand: string, fromMl: number, toMl: number) => number;
  packCost: (packId: string | null | undefined) => number;
  whName: (id: string | null | undefined) => string;
}

/** Susun model operasional: kategori SKU, sumber fullsize, aturan konversi, dan urutan transaksi. */
export function buildOpsModel(input: OpsInput): OpsModel {
  const rules = input.rules;
  const isSrc = new Set(rules.map((c) => `${c.brand}|${+c.fromMl}`));
  const isDst = new Set(rules.map((c) => `${c.brand}|${+c.toMl}`));
  const skuMap: Record<string, OpsSkuRow> = {};
  for (const v of input.skus) {
    const ml = +v.ml || 0;
    skuMap[v.code] = {
      ...v,
      ml,
      category: isSrc.has(`${v.brand}|${ml}`) ? 'Fullsize' : isDst.has(`${v.brand}|${ml}`) ? 'Decant' : 'Lainnya',
    };
  }
  const autoSrc: Record<string, string> = {};
  const fsCount: Record<string, number> = {};
  for (const s of Object.values(skuMap))
    if (s.category === 'Fullsize') {
      const k = variantKey(s.brand, s.product);
      fsCount[k] = (fsCount[k] || 0) + 1;
      if (!autoSrc[k] || s.ml > skuMap[autoSrc[k]].ml) autoSrc[k] = s.code;
    }
  const mainSrc: Record<string, string> = { ...autoSrc };
  for (const k in input.sourceOverrides) {
    const v = input.sourceOverrides[k];
    if (v && skuMap[v]) mainSrc[k] = v;
  }
  const ruleFor = (b: string, from: number, to: number) => rules.find((c) => c.brand === b && +c.fromMl === +from && +c.toMl === +to) || null;
  const packRule = (b: string, from: number, to: number) => ruleFor(b, from, to) || rules.find((c) => c.brand === b && +c.toMl === +to && c.packId) || null;
  const ratio = (b: string, from: number, to: number) => {
    const r = ruleFor(b, from, to);
    return r ? +r.qtyPerBottle || 0 : 0;
  };
  const packCost = (id: string | null | undefined) => {
    const p = input.packs.find((x) => x.id === id);
    return p ? (+p.bottle || 0) + (+p.sticker || 0) + (+p.other || 0) : 0;
  };
  const movements: Movement[] = [...input.movements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq || 0) - (b.seq || 0)));
  const opnames: Opname[] = [...input.opnames].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const whName = (id: string | null | undefined) => input.warehouses.find((w) => w.id === id)?.name ?? (id || '–');
  return {
    ...input,
    movements,
    opnames,
    skuMap,
    mainSrc,
    autoSrc,
    fsCount,
    yieldFrac: (+input.config.shrinkPct || DEFAULT_SHRINK_PCT) / 100,
    targetDays: +input.config.targetDays || DEFAULT_TARGET_DAYS,
    ruleFor,
    packRule,
    ratio,
    packCost,
    whName,
  };
}

/** Lead time untuk perhitungan restock: kosong atau 99 (kebijakan brand) dianggap 7 hari. */
export function leadTimeOrDefault(m: OpsModel, brand: string): number {
  const lt = m.leadTimes[brand];
  return lt === undefined || lt === null || +lt === 99 ? 7 : +lt;
}
