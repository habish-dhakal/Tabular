/**
 * Exhaustive pure-logic QA audit — no server needed.
 * Exercises every formula function/operator, every field coercion, and every
 * filter operator directly against the lib implementations.
 *   Run: npx tsx scripts/qa-audit.mts
 */
import { evaluateFormula, validateFormula } from "@/lib/formula";
import { coerceCellValue } from "@/lib/fields";
import { evaluateCondition } from "@/lib/query";
import type { FieldDTO, FilterOp } from "@/lib/types";
import type { FieldType } from "@/server/db/schema";

let pass = 0;
const fails: string[] = [];
const J = (v: unknown) => JSON.stringify(v);
function eq(name: string, got: unknown, want: unknown) {
  const ok = J(got) === J(want);
  if (ok) pass++;
  else { fails.push(`${name}: got ${J(got)} want ${J(want)}`); console.log("  ✗", name, "got", J(got), "want", J(want)); }
}
function truthy(name: string, cond: boolean) { eq(name, !!cond, true); }
function throws(name: string, fn: () => unknown) {
  try { fn(); fails.push(`${name}: expected throw`); console.log("  ✗", name, "expected throw"); }
  catch { pass++; }
}

/* ============================ FORMULA ENGINE ============================ */
const vals: Record<string, string | number | boolean | null> = {
  qty: 3, price: 4, first: "Jane", last: "Doe", when: "2026-07-03", flag: true, empty: null,
};
const F = (expr: string) => evaluateFormula(expr, (n) => vals[n.toLowerCase()] ?? null);

console.log("— Formula: text —");
eq("UPPER", F(`UPPER("abc")`), "ABC");
eq("LOWER", F(`LOWER("ABC")`), "abc");
eq("TRIM", F(`TRIM("  hi  ")`), "hi");
eq("LEN", F(`LEN("hello")`), 5);
eq("LEFT", F(`LEFT("hello",2)`), "he");
eq("RIGHT", F(`RIGHT("hello",2)`), "lo");
eq("MID", F(`MID("hello",2,3)`), "ell");
eq("REPT", F(`REPT("ab",3)`), "ababab");
eq("REPLACE", F(`REPLACE("hello",1,1,"J")`), "Jello");
eq("SUBSTITUTE", F(`SUBSTITUTE("a-b-c","-","+")`), "a+b+c");
eq("SEARCH", F(`SEARCH("LO","hello")`), 4);
eq("FIND", F(`FIND("l","hello")`), 3);
eq("T-string", F(`T("x")`), "x");
eq("T-number", F(`T(5)`), "");
eq("VALUE", F(`VALUE("$1,234.50")`), 1234.5);
eq("CONCATENATE", F(`CONCATENATE("a","b","c")`), "abc");
eq("CONCAT", F(`CONCAT("a","b")`), "ab");

console.log("— Formula: math —");
eq("ROUND", F(`ROUND(3.14159,2)`), 3.14);
eq("ROUNDUP", F(`ROUNDUP(3.141,2)`), 3.15);
eq("ROUNDDOWN", F(`ROUNDDOWN(3.149,2)`), 3.14);
eq("INT", F(`INT(3.9)`), 3);
eq("FLOOR", F(`FLOOR(3.9)`), 3);
eq("CEIL", F(`CEIL(3.1)`), 4);
eq("CEILING", F(`CEILING(3.1)`), 4);
eq("ABS", F(`ABS(-5)`), 5);
eq("SQRT", F(`SQRT(9)`), 3);
eq("POWER", F(`POWER(2,10)`), 1024);
eq("EXP", F(`EXP(0)`), 1);
eq("LOG-base10", F(`LOG(100)`), 2);
eq("LOG-base2", F(`LOG(8,2)`), 3);
eq("MOD", F(`MOD(7,3)`), 1);
eq("SIGN", F(`SIGN(-3)`), -1);
eq("EVEN", F(`EVEN(3)`), 4);
eq("ODD", F(`ODD(2)`), 3);
eq("MIN", F(`MIN(3,1,2)`), 1);
eq("MAX", F(`MAX(3,1,2)`), 3);
eq("SUM", F(`SUM(1,2,3)`), 6);
eq("AVERAGE", F(`AVERAGE(2,4,6)`), 4);
eq("COUNT", F(`COUNT(1,"a",2,"")`), 2);
eq("COUNTA", F(`COUNTA(1,"a",2,"")`), 3);

console.log("— Formula: logic —");
eq("NOT", F(`NOT(TRUE)`), false);
eq("XOR-tt", F(`XOR(TRUE,TRUE)`), false);
eq("XOR-tf", F(`XOR(TRUE,FALSE)`), true);
eq("ISBLANK-blank", F(`ISBLANK(BLANK())`), true);
eq("ISBLANK-val", F(`ISBLANK("x")`), false);
eq("IF-false", F(`IF(1>2,"a","b")`), "b");
eq("IF-true", F(`IF(1<2,"a","b")`), "a");
eq("AND", F(`AND(TRUE,TRUE,FALSE)`), false);
eq("OR", F(`OR(FALSE,TRUE)`), true);
eq("SWITCH-match", F(`SWITCH("b","a",1,"b",2,99)`), 2);
eq("SWITCH-default", F(`SWITCH("z","a",1,99)`), 99);
eq("ISERROR-true", F(`ISERROR(1/0)`), true);
eq("ISERROR-false", F(`ISERROR(5)`), false);
eq("IFERROR-catch", F(`IFERROR(1/0,"safe")`), "safe");
eq("IFERROR-pass", F(`IFERROR(5,"safe")`), 5);

console.log("— Formula: operators —");
eq("add", F(`3+4`), 7);
eq("sub", F(`10-3`), 7);
eq("mul", F(`3*4`), 12);
eq("div", F(`12/4`), 3);
eq("mod-op", F(`7%3`), 1);
eq("concat-amp", F(`"a"&"b"`), "ab");
eq("eq", F(`3=3`), true);
eq("neq", F(`3!=4`), true);
eq("neq-alt", F(`3<>4`), true);
eq("lt", F(`2<3`), true);
eq("lte", F(`3<=3`), true);
eq("gt", F(`4>3`), true);
eq("gte", F(`3>=3`), true);
eq("and-op", F(`TRUE && FALSE`), false);
eq("or-op", F(`FALSE || TRUE`), true);
eq("not-op", F(`!FALSE`), true);
eq("unary-neg", F(`-5`), -5);

console.log("— Formula: field refs —");
eq("field-mul", F(`{Qty}*{Price}`), 12);
eq("field-concat", F(`{First} & " " & {Last}`), "Jane Doe");
eq("field-empty", F(`ISBLANK({Empty})`), true);

console.log("— Formula: dates —");
eq("YEAR", F(`YEAR("2026-07-03")`), 2026);
eq("MONTH", F(`MONTH("2026-07-03")`), 7);
eq("DAY", F(`DAY("2026-07-03")`), 3);
eq("WEEKDAY", F(`WEEKDAY("2026-07-03")`), 5);
eq("DATESTR", F(`DATESTR("2026-07-03T10:00:00")`), "2026-07-03");
eq("DATETIME_DIFF", F(`DATETIME_DIFF("2026-07-03","2026-07-01","days")`), 2);
eq("IS_BEFORE", F(`IS_BEFORE("2026-07-01","2026-07-03")`), true);
eq("IS_AFTER", F(`IS_AFTER("2026-07-03","2026-07-01")`), true);
eq("IS_SAME", F(`IS_SAME("2026-07-03","2026-07-03")`), true);
eq("DATETIME_FORMAT", F(`DATETIME_FORMAT("2026-07-03","YYYY/MM/DD")`), "2026/07/03");
truthy("TODAY format", /^\d{4}-\d{2}-\d{2}$/.test(String(F(`TODAY()`))));
truthy("NOW format", /^\d{4}-\d{2}-\d{2}T/.test(String(F(`NOW()`))));
truthy("DATEADD", String(F(`DATEADD("2026-07-01",2,"days")`)).includes("2026-07"));

console.log("— Formula: errors & validation —");
eq("div-by-zero", F(`1/0`), "#ERROR");
eq("unclosed-paren", F(`UPPER(`), "#ERROR");
eq("unclosed-brace", F(`{Unclosed`), "#ERROR");
eq("bare-TRUE", F(`TRUE`), true);
eq("bare-FALSE", F(`FALSE`), false);
eq("unknown-func", F(`FOO(1)`), "#ERROR");
eq("unknown-name", F(`HELLO`), "#ERROR");
eq("validate-ok", validateFormula("1+2"), null);
truthy("validate-bad-trailing", validateFormula("1+") !== null);
truthy("validate-bad-func", validateFormula("UPPER(") !== null);

/* ============================ COERCION ============================ */
console.log("— Coercion —");
const C = (t: FieldType, v: unknown, o: Record<string, unknown> = {}) => coerceCellValue(t, v, o);
eq("text", C("singleLineText", "x"), "x");
eq("text-from-number", C("singleLineText", 42), "42");
eq("longText", C("longText", "abc"), "abc");
eq("url", C("url", "http://a.com"), "http://a.com");
eq("email", C("email", "a@b.com"), "a@b.com");
eq("phone", C("phone", "123"), "123");
eq("number", C("number", "3.5"), 3.5);
eq("number-num", C("number", 42), 42);
throws("number-invalid", () => C("number", "abc"));
eq("currency", C("currency", "10"), 10);
eq("percent", C("percent", "50"), 50);
eq("rating-clamp-high", C("rating", 7, { max: 5 }), 5);
eq("rating-clamp-low", C("rating", -1, { max: 5 }), 0);
eq("rating-mid", C("rating", 3, { max: 5 }), 3);
eq("checkbox-truthy", C("checkbox", "x"), true);
eq("checkbox-zero", C("checkbox", 0), false);
eq("date-iso", C("date", "2026-07-03"), "2026-07-03");
eq("date-parse", C("date", "2026/07/03"), "2026-07-03");
throws("date-invalid", () => C("date", "notadate"));
truthy("dateTime-iso", /^2026-07-03T/.test(String(C("dateTime", "2026-07-03T10:00:00Z"))));
throws("dateTime-invalid", () => C("dateTime", "bad"));
const choices = [{ id: "a", name: "A", color: "#f00" }, { id: "b", name: "B", color: "#0f0" }];
eq("singleSelect-valid", C("singleSelect", "a", { choices }), "a");
throws("singleSelect-invalid", () => C("singleSelect", "z", { choices }));
eq("multiSelect-valid", C("multiSelect", ["a", "b"], { choices }), ["a", "b"]);
throws("multiSelect-invalid", () => C("multiSelect", ["z"], { choices }));
eq("user", C("user", "usr_1"), "usr_1");
eq("empty-null", C("number", null), undefined);
eq("empty-string", C("singleLineText", ""), undefined);
throws("computed-not-editable", () => C("formula", "x"));
throws("lookup-not-editable", () => C("lookup", "x"));
throws("rollup-not-editable", () => C("rollup", "x"));

/* ============================ FILTER CONDITIONS ============================ */
console.log("— Filter operators —");
const mkField = (type: FieldType, options: Record<string, unknown> = {}): FieldDTO =>
  ({ id: "f", tableId: "t", name: "F", type, options, position: 0, isPrimary: false });
const cond = (f: FieldDTO, cell: unknown, op: FilterOp, target: unknown) => evaluateCondition(f, cell, op, target);
const tf = mkField("singleLineText");
eq("text-is", cond(tf, "Hello", "is", "hello"), true);
eq("text-isNot", cond(tf, "Hello", "isNot", "world"), true);
eq("text-contains", cond(tf, "Hello", "contains", "ell"), true);
eq("text-doesNotContain", cond(tf, "Hello", "doesNotContain", "xyz"), true);
eq("text-isEmpty", cond(tf, "", "isEmpty", null), true);
eq("text-isNotEmpty", cond(tf, "x", "isNotEmpty", null), true);
const nf = mkField("number");
eq("num-eq", cond(nf, 5, "eq", 5), true);
eq("num-neq", cond(nf, 5, "neq", 6), true);
eq("num-lt", cond(nf, 4, "lt", 5), true);
eq("num-lte", cond(nf, 5, "lte", 5), true);
eq("num-gt", cond(nf, 6, "gt", 5), true);
eq("num-gte", cond(nf, 5, "gte", 5), true);
eq("num-eq-false", cond(nf, 5, "eq", 6), false);
const bf = mkField("checkbox");
eq("bool-is-true", cond(bf, true, "is", true), true);
eq("bool-is-false", cond(bf, false, "is", true), false);
const sf = mkField("singleSelect", { choices });
eq("select-is", cond(sf, "a", "is", "a"), true);
eq("select-isNot", cond(sf, "a", "isNot", "b"), true);
eq("select-isAnyOf", cond(sf, "a", "isAnyOf", ["a", "b"]), true);
eq("select-isNoneOf", cond(sf, "a", "isNoneOf", ["b"]), true);
const mf = mkField("multiSelect", { choices });
eq("multi-hasAnyOf", cond(mf, ["a", "b"], "hasAnyOf", ["b"]), true);
eq("multi-hasAllOf", cond(mf, ["a", "b"], "hasAllOf", ["a", "b"]), true);
eq("multi-hasNoneOf", cond(mf, ["a"], "hasNoneOf", ["b"]), true);
eq("multi-hasAllOf-false", cond(mf, ["a"], "hasAllOf", ["a", "b"]), false);
const df = mkField("date");
eq("date-is", cond(df, "2026-07-03", "is", "2026-07-03"), true);
eq("date-isBefore", cond(df, "2026-07-01", "isBefore", "2026-07-03"), true);
eq("date-isAfter", cond(df, "2026-07-05", "isAfter", "2026-07-03"), true);
eq("date-isOnOrBefore", cond(df, "2026-07-03", "isOnOrBefore", "2026-07-03"), true);
eq("date-isOnOrAfter", cond(df, "2026-07-03", "isOnOrAfter", "2026-07-03"), true);

/* ============================ REPORT ============================ */
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("\nFailures:"); fails.forEach((f) => console.log("  -", f)); process.exit(1); }
console.log("✓ All pure-logic QA checks passed");
