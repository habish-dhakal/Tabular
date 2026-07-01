/**
 * A small, safe formula language for formula fields.
 *
 * Supports:
 *   - numbers, "strings" / 'strings', TRUE / FALSE
 *   - field references:  {Field Name}
 *   - arithmetic: + - * / %   comparison: = != <> < <= > >=
 *   - logic: AND(...) OR(...) NOT(x)  &&  ||  !
 *   - string concat with &   e.g. {First} & " " & {Last}
 *   - functions: IF, CONCATENATE, LOWER, UPPER, TRIM, LEN, LEFT, RIGHT, MID,
 *     ROUND, FLOOR, CEIL, ABS, MIN, MAX, SUM, AVERAGE, YEAR, MONTH, DAY,
 *     TODAY, NOW
 *
 * Evaluation is pure (no eval), so user expressions can't run arbitrary code.
 */

export type FormulaValue = number | string | boolean | null;

/* ----------------------------- Tokenizer ----------------------------- */
type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "field"; v: string }
  | { t: "ident"; v: string }
  | { t: "op"; v: string }
  | { t: "("; }
  | { t: ")"; }
  | { t: ","; };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isIdent = (c: string) => /[A-Za-z_]/.test(c);

  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }

    if (c === "{") {
      const end = src.indexOf("}", i);
      if (end === -1) throw new Error("Unclosed { in formula");
      toks.push({ t: "field", v: src.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) { s += src[j + 1]; j += 2; }
        else { s += src[j]; j++; }
      }
      if (j >= src.length) throw new Error("Unclosed string");
      toks.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1]))) {
      let j = i;
      while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
      toks.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (isIdent(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ t: "ident", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "(") { toks.push({ t: "(" }); i++; continue; }
    if (c === ")") { toks.push({ t: ")" }); i++; continue; }
    if (c === ",") { toks.push({ t: "," }); i++; continue; }

    // multi-char operators
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "!=", "<>", "&&", "||"].includes(two)) {
      toks.push({ t: "op", v: two === "<>" ? "!=" : two }); i += 2; continue;
    }
    if ("+-*/%&<>=!".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }

    throw new Error(`Unexpected character "${c}"`);
  }
  return toks;
}

/* ------------------------------- Parser ------------------------------ */
type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "field"; name: string }
  | { k: "unary"; op: string; x: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; name: string; args: Node[] };

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  // Operator at the cursor, or null. Centralises the narrowing.
  const peekOp = (): string | null => {
    const tk = toks[p];
    return tk && tk.t === "op" ? tk.v : null;
  };

  function parseExpr(): Node { return parseOr(); }

  function parseOr(): Node {
    let a = parseAnd();
    while (peekOp() === "||") { next(); a = { k: "bin", op: "||", a, b: parseAnd() }; }
    return a;
  }
  function parseAnd(): Node {
    let a = parseCmp();
    while (peekOp() === "&&") { next(); a = { k: "bin", op: "&&", a, b: parseCmp() }; }
    return a;
  }
  function parseCmp(): Node {
    let a = parseConcat();
    let op: string | null;
    while ((op = peekOp()) && ["=", "!=", "<", "<=", ">", ">="].includes(op)) {
      next();
      a = { k: "bin", op, a, b: parseConcat() };
    }
    return a;
  }
  function parseConcat(): Node {
    let a = parseAdd();
    while (peekOp() === "&") { next(); a = { k: "bin", op: "&", a, b: parseAdd() }; }
    return a;
  }
  function parseAdd(): Node {
    let a = parseMul();
    let op: string | null;
    while ((op = peekOp()) && (op === "+" || op === "-")) {
      next();
      a = { k: "bin", op, a, b: parseMul() };
    }
    return a;
  }
  function parseMul(): Node {
    let a = parseUnary();
    let op: string | null;
    while ((op = peekOp()) && ["*", "/", "%"].includes(op)) {
      next();
      a = { k: "bin", op, a, b: parseUnary() };
    }
    return a;
  }
  function parseUnary(): Node {
    const op = peekOp();
    if (op === "-" || op === "!") {
      next();
      return { k: "unary", op, x: parseUnary() };
    }
    return parsePrimary();
  }
  function parsePrimary(): Node {
    const tk = next();
    if (!tk) throw new Error("Unexpected end of formula");
    if (tk.t === "num") return { k: "num", v: tk.v };
    if (tk.t === "str") return { k: "str", v: tk.v };
    if (tk.t === "field") return { k: "field", name: tk.v };
    if (tk.t === "(") {
      const e = parseExpr();
      if (next()?.t !== ")") throw new Error("Expected )");
      return e;
    }
    if (tk.t === "ident") {
      const upper = tk.v.toUpperCase();
      if (peek()?.t === "(") {
        next();
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(parseExpr());
          while (peek()?.t === ",") { next(); args.push(parseExpr()); }
        }
        if (next()?.t !== ")") throw new Error("Expected ) after arguments");
        return { k: "call", name: upper, args };
      }
      // No parentheses after the name.
      if (upper === "TRUE") return { k: "bool", v: true };
      if (upper === "FALSE") return { k: "bool", v: false };
      if (KNOWN_FUNCS.has(upper)) {
        throw new Error(`${upper} is a function — add parentheses, e.g. ${upper}(…)`);
      }
      throw new Error(`Unknown name "${tk.v}". Reference fields with braces: {${tk.v}}`);
    }
    throw new Error("Unexpected token in formula");
  }

  const node = parseExpr();
  if (p < toks.length) throw new Error("Unexpected trailing input");
  return node;
}

/* ----------------------------- Evaluator ----------------------------- */
const toNum = (v: FormulaValue): number =>
  v === null || v === "" ? 0 : typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
const toStr = (v: FormulaValue): string =>
  v === null ? "" : typeof v === "boolean" ? (v ? "true" : "false") : String(v);
const toBool = (v: FormulaValue): boolean =>
  typeof v === "boolean" ? v : v === null || v === "" || v === 0 ? false : true;

type Resolver = (fieldName: string) => FormulaValue;

const isBlank = (v: FormulaValue) => v === null || v === "" || (typeof v === "number" && Number.isNaN(v));
const toDate = (v: FormulaValue): Date | null => {
  if (v === null || v === "") return null;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDate(d: Date, fmt: string): string {
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()), YY: pad(d.getFullYear() % 100),
    MMMM: MONTHS[d.getMonth()], MMM: MONTHS[d.getMonth()].slice(0, 3),
    MM: pad(d.getMonth() + 1), M: String(d.getMonth() + 1),
    DD: pad(d.getDate()), D: String(d.getDate()),
    dddd: DAYS[d.getDay()], ddd: DAYS[d.getDay()].slice(0, 3),
    HH: pad(d.getHours()), H: String(d.getHours()),
    hh: pad(((d.getHours() + 11) % 12) + 1), h: String(((d.getHours() + 11) % 12) + 1),
    mm: pad(d.getMinutes()), m: String(d.getMinutes()),
    ss: pad(d.getSeconds()), s: String(d.getSeconds()),
    A: d.getHours() < 12 ? "AM" : "PM", a: d.getHours() < 12 ? "am" : "pm",
  };
  return fmt.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g, (t) => map[t] ?? t);
}
function diffUnits(ms: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("year")) return ms / 31557600000;
  if (u.startsWith("month")) return ms / 2629800000;
  if (u.startsWith("week")) return ms / 604800000;
  if (u.startsWith("day")) return ms / 86400000;
  if (u.startsWith("hour")) return ms / 3600000;
  if (u.startsWith("minute")) return ms / 60000;
  if (u.startsWith("second")) return ms / 1000;
  return ms;
}

const FUNCS: Record<string, (args: FormulaValue[]) => FormulaValue> = {
  NOT: (a) => !toBool(a[0]),
  XOR: (a) => a.filter(toBool).length % 2 === 1,
  BLANK: () => null,
  TRUE: () => true,
  FALSE: () => false,
  ISBLANK: (a) => isBlank(a[0]),
  // text
  CONCATENATE: (a) => a.map(toStr).join(""),
  CONCAT: (a) => a.map(toStr).join(""),
  LOWER: (a) => toStr(a[0]).toLowerCase(),
  UPPER: (a) => toStr(a[0]).toUpperCase(),
  TRIM: (a) => toStr(a[0]).trim(),
  LEN: (a) => toStr(a[0]).length,
  LEFT: (a) => toStr(a[0]).slice(0, toNum(a[1])),
  RIGHT: (a) => toStr(a[0]).slice(-toNum(a[1])),
  MID: (a) => toStr(a[0]).slice(toNum(a[1]) - 1, toNum(a[1]) - 1 + toNum(a[2])),
  REPT: (a) => toStr(a[0]).repeat(Math.max(0, toNum(a[1]))),
  REPLACE: (a) => { const s = toStr(a[0]); const start = toNum(a[1]) - 1; const count = toNum(a[2]); return s.slice(0, start) + toStr(a[3]) + s.slice(start + count); },
  SUBSTITUTE: (a) => toStr(a[0]).split(toStr(a[1])).join(toStr(a[2])),
  SEARCH: (a) => { const i = toStr(a[1]).toLowerCase().indexOf(toStr(a[0]).toLowerCase(), a[2] ? toNum(a[2]) - 1 : 0); return i < 0 ? null : i + 1; },
  FIND: (a) => { const i = toStr(a[1]).indexOf(toStr(a[0]), a[2] ? toNum(a[2]) - 1 : 0); return i < 0 ? 0 : i + 1; },
  T: (a) => (typeof a[0] === "string" ? a[0] : ""),
  VALUE: (a) => { const n = parseFloat(toStr(a[0]).replace(/[^0-9.eE+-]/g, "")); return Number.isNaN(n) ? null : n; },
  // math
  ROUND: (a) => { const f = 10 ** toNum(a[1] ?? 0); return Math.round(toNum(a[0]) * f) / f; },
  ROUNDUP: (a) => { const f = 10 ** toNum(a[1] ?? 0); return Math.ceil(toNum(a[0]) * f) / f; },
  ROUNDDOWN: (a) => { const f = 10 ** toNum(a[1] ?? 0); return Math.trunc(toNum(a[0]) * f) / f; },
  INT: (a) => Math.floor(toNum(a[0])),
  FLOOR: (a) => Math.floor(toNum(a[0])),
  CEIL: (a) => Math.ceil(toNum(a[0])),
  CEILING: (a) => Math.ceil(toNum(a[0])),
  ABS: (a) => Math.abs(toNum(a[0])),
  SQRT: (a) => Math.sqrt(toNum(a[0])),
  POWER: (a) => toNum(a[0]) ** toNum(a[1]),
  EXP: (a) => Math.exp(toNum(a[0])),
  LOG: (a) => (a[1] != null ? Math.log(toNum(a[0])) / Math.log(toNum(a[1])) : Math.log10(toNum(a[0]))),
  MOD: (a) => toNum(a[0]) % toNum(a[1]),
  SIGN: (a) => Math.sign(toNum(a[0])),
  EVEN: (a) => { const n = Math.ceil(Math.abs(toNum(a[0]))); const e = n % 2 ? n + 1 : n; return toNum(a[0]) < 0 ? -e : e; },
  ODD: (a) => { const n = Math.ceil(Math.abs(toNum(a[0]))); const o = n % 2 ? n : n + 1; return toNum(a[0]) < 0 ? -o : o; },
  MIN: (a) => Math.min(...a.map(toNum)),
  MAX: (a) => Math.max(...a.map(toNum)),
  SUM: (a) => a.reduce<number>((s, x) => s + toNum(x), 0),
  AVERAGE: (a) => (a.length ? a.reduce<number>((s, x) => s + toNum(x), 0) / a.length : 0),
  COUNT: (a) => a.filter((x) => !isBlank(x) && !Number.isNaN(Number(x))).length,
  COUNTA: (a) => a.filter((x) => !isBlank(x)).length,
  // date
  TODAY: () => new Date().toISOString().slice(0, 10),
  NOW: () => new Date().toISOString(),
  YEAR: (a) => { const d = toDate(a[0]); return d ? d.getFullYear() : null; },
  MONTH: (a) => { const d = toDate(a[0]); return d ? d.getMonth() + 1 : null; },
  DAY: (a) => { const d = toDate(a[0]); return d ? d.getDate() : null; },
  HOUR: (a) => { const d = toDate(a[0]); return d ? d.getHours() : null; },
  MINUTE: (a) => { const d = toDate(a[0]); return d ? d.getMinutes() : null; },
  SECOND: (a) => { const d = toDate(a[0]); return d ? d.getSeconds() : null; },
  WEEKDAY: (a) => { const d = toDate(a[0]); if (!d) return null; const start = a[1] ? toStr(a[1]).toLowerCase() : "sunday"; return start.startsWith("mon") ? (d.getDay() + 6) % 7 : d.getDay(); },
  DATESTR: (a) => { const d = toDate(a[0]); return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null; },
  DATETIME_FORMAT: (a) => { const d = toDate(a[0]); return d ? formatDate(d, a[1] != null ? toStr(a[1]) : "YYYY-MM-DD") : null; },
  DATEADD: (a) => {
    const d = toDate(a[0]); if (!d) return null;
    const n = toNum(a[1]); const u = toStr(a[2]).toLowerCase(); const nd = new Date(d);
    if (u.startsWith("year")) nd.setFullYear(nd.getFullYear() + n);
    else if (u.startsWith("month")) nd.setMonth(nd.getMonth() + n);
    else if (u.startsWith("week")) nd.setDate(nd.getDate() + n * 7);
    else if (u.startsWith("day")) nd.setDate(nd.getDate() + n);
    else if (u.startsWith("hour")) nd.setHours(nd.getHours() + n);
    else if (u.startsWith("minute")) nd.setMinutes(nd.getMinutes() + n);
    else if (u.startsWith("second")) nd.setSeconds(nd.getSeconds() + n);
    return nd.toISOString();
  },
  DATETIME_DIFF: (a) => {
    const d1 = toDate(a[0]); const d2 = toDate(a[1]); if (!d1 || !d2) return null;
    return Math.trunc(diffUnits(d1.getTime() - d2.getTime(), a[2] != null ? toStr(a[2]) : "days"));
  },
  IS_BEFORE: (a) => { const d1 = toDate(a[0]); const d2 = toDate(a[1]); return d1 && d2 ? d1.getTime() < d2.getTime() : false; },
  IS_AFTER: (a) => { const d1 = toDate(a[0]); const d2 = toDate(a[1]); return d1 && d2 ? d1.getTime() > d2.getTime() : false; },
  IS_SAME: (a) => { const d1 = toDate(a[0]); const d2 = toDate(a[1]); return d1 && d2 ? d1.getTime() === d2.getTime() : false; },
};

/** Functions with special (lazy / control-flow) evaluation. */
const LAZY_FUNCS = new Set(["IF", "AND", "OR", "SWITCH", "ISERROR", "IFERROR"]);
const KNOWN_FUNCS = new Set([...Object.keys(FUNCS), ...LAZY_FUNCS]);

function evalNode(n: Node, resolve: Resolver): FormulaValue {
  switch (n.k) {
    case "num": return n.v;
    case "str": return n.v;
    case "bool": return n.v;
    case "field": return resolve(n.name);
    case "unary": {
      const x = evalNode(n.x, resolve);
      return n.op === "-" ? -toNum(x) : !toBool(x);
    }
    case "call": {
      // Control-flow functions evaluate their arguments lazily.
      if (n.name === "IF") {
        return toBool(evalNode(n.args[0], resolve))
          ? (n.args[1] ? evalNode(n.args[1], resolve) : null)
          : (n.args[2] ? evalNode(n.args[2], resolve) : null);
      }
      if (n.name === "AND") return n.args.every((a) => toBool(evalNode(a, resolve)));
      if (n.name === "OR") return n.args.some((a) => toBool(evalNode(a, resolve)));
      if (n.name === "SWITCH") {
        const subj = toStr(evalNode(n.args[0], resolve));
        let i = 1;
        for (; i + 1 < n.args.length; i += 2) {
          if (toStr(evalNode(n.args[i], resolve)) === subj) return evalNode(n.args[i + 1], resolve);
        }
        return i < n.args.length ? evalNode(n.args[i], resolve) : null; // trailing = default
      }
      if (n.name === "ISERROR") {
        try { return evalNode(n.args[0], resolve) === "#ERROR"; } catch { return true; }
      }
      if (n.name === "IFERROR") {
        try { const v = evalNode(n.args[0], resolve); return v === "#ERROR" ? evalNode(n.args[1], resolve) : v; }
        catch { return n.args[1] ? evalNode(n.args[1], resolve) : null; }
      }
      const fn = FUNCS[n.name];
      if (!fn) throw new Error(`Unknown function ${n.name}()`);
      return fn(n.args.map((a) => evalNode(a, resolve)));
    }
    case "bin": {
      const op = n.op;
      if (op === "&&" || op === "||") {
        const a = toBool(evalNode(n.a, resolve));
        if (op === "&&") return a ? toBool(evalNode(n.b, resolve)) : false;
        return a ? true : toBool(evalNode(n.b, resolve));
      }
      const a = evalNode(n.a, resolve);
      const b = evalNode(n.b, resolve);
      switch (op) {
        case "+": return toNum(a) + toNum(b);
        case "-": return toNum(a) - toNum(b);
        case "*": return toNum(a) * toNum(b);
        case "/": { const d = toNum(b); if (d === 0) throw new Error("Division by zero"); return toNum(a) / d; }
        case "%": return toNum(a) % toNum(b);
        case "&": return toStr(a) + toStr(b);
        case "=": return a === b || toStr(a) === toStr(b);
        case "!=": return !(a === b || toStr(a) === toStr(b));
        case "<": return toNum(a) < toNum(b);
        case "<=": return toNum(a) <= toNum(b);
        case ">": return toNum(a) > toNum(b);
        case ">=": return toNum(a) >= toNum(b);
        default: throw new Error(`Unknown operator ${op}`);
      }
    }
  }
}

/** Compile once, evaluate many. Throws on parse error. */
export function compileFormula(expr: string): (resolve: Resolver) => FormulaValue {
  const ast = parse(tokenize(expr));
  return (resolve: Resolver) => evalNode(ast, resolve);
}

/** Convenience: parse + evaluate, returning "#ERROR" on any failure. */
export function evaluateFormula(expr: string, resolve: Resolver): FormulaValue {
  try {
    return compileFormula(expr)(resolve);
  } catch {
    return "#ERROR";
  }
}

/** Validate an expression without evaluating. Returns an error message or null. */
export function validateFormula(expr: string): string | null {
  try {
    parse(tokenize(expr));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
