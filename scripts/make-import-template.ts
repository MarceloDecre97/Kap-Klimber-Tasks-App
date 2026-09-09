/**
 * Writes the .xlsx people fill in to bring an existing spreadsheet into the
 * address book.
 *
 *   npx tsx scripts/make-import-template.ts out.xlsx
 *
 * It exists as a script rather than a one-off because the sheet quotes the
 * relationship and company-type lists by name, and those drift — a type
 * invented through "New type" belongs in the next template. Regenerate it
 * rather than editing the workbook by hand.
 *
 *   select 'type', label from public.company_types
 *   union all select 'relationship', label from public.contact_relationships;
 *
 * The ZIP and XML below duplicate src/lib/export/xlsx.ts, which is the one
 * place they should live. They are copied here because that module opens
 * with `import "server-only"` — correct for a module that runs in a route
 * handler, and fatal under plain tsx, which is how a script runs. Keeping
 * the copy is cheaper than weakening the boundary the app relies on.
 *
 * Every cell is an inline string, for the reason given in that module: a
 * phone number or a ZIP has to survive as text.
 */
import { writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

function escapeXml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}
function cellRef(col: number, row: number): string {
  let name = ""; let n = col;
  do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return `${name}${row}`;
}
function sheetXml(rows: string[][]): string {
  const body = rows.map((cells, r) => {
    const rowNum = r + 1;
    const tds = cells.map((value, c) => value === "" ? ""
      : `<c r="${cellRef(c, rowNum)}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`).join("");
    return `<row r="${rowNum}">${tds}</row>`;
  }).join("");
  const width = Math.max(...rows.map((r) => r.length), 1);
  const lastCol = cellRef(width - 1, 1).replace(/\d+$/, "");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData><ignoredErrors><ignoredError sqref="A1:${lastCol}${rows.length}" numberStoredAsText="1"/></ignoredErrors></worksheet>`;
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) { let c = i; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8"); const raw = e.data;
    const def = deflateRawSync(raw); const useDef = def.length < raw.length;
    const body = useDef ? def : raw; const method = useDef ? 8 : 0; const sum = crc32(raw);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0, 6);
    l.writeUInt16LE(method, 8); l.writeUInt16LE(0, 10); l.writeUInt16LE(0, 12);
    l.writeUInt32LE(sum, 14); l.writeUInt32LE(body.length, 18); l.writeUInt32LE(raw.length, 22);
    l.writeUInt16LE(name.length, 26); l.writeUInt16LE(0, 28);
    locals.push(l, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0, 8); c.writeUInt16LE(method, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0, 14);
    c.writeUInt32LE(sum, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36); c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42);
    centrals.push(c, name);
    offset += l.length + name.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, end]);
}
interface Sheet {
  name: string;
  rows: string[][];
}
function buildWorkbook(sheets: Sheet[]): Buffer {
  const safe = (n: string) => (n.replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet").slice(0, 31);
  const parts = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(s.rows), "utf8") }));
  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
      }</Types>`, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
        sheets.map((s, i) => `<sheet name="${escapeXml(safe(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
      }</sheets></workbook>`, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
      }</Relationships>`, "utf8") },
    ...parts,
  ]);
}

/*
  One row per person. Companies are created and linked from the company
  columns on that row — the same rule the contact form already follows, so
  there is no second sheet to keep in step. A company's own details are read
  from the first row that names it; leave them blank on every row after.

  A row with a company but no name adds the company on its own.
*/
const headers = [
  "First name", "Last name",
  "Job title", "Mobile", "Office phone", "Email", "Second email", "Website",
  "What they are to us", "Where they came from", "Notes",
  "Their street", "Their suite", "Their city", "Their state", "Their ZIP", "Their country",
  "Company", "Company types", "What the company does", "Company website",
  "Company main line", "Company street", "Company suite", "Company city",
  "Company state", "Company ZIP", "Company country",
];

const DELETE = "EXAMPLE — delete this row";

const examples: string[][] = [
  [
    DELETE, "Morrison",
    "Vice President of Aftermarket Sales", "3133040028", "", "mike@royaltruck.com", "", "",
    "Client", "Trade show", "Met at Work Truck Week.",
    "", "", "", "", "", "",
    "Royal Truck & Utility Trailer", "Trailer Dealer, Parts Dealer, Upfitter",
    "Full-service truck and trailer dealer.", "royaltruck.com", "2485550100",
    "311 E. Cady St.", "", "Northville", "Michigan", "48167", "United States",
  ],
  [
    DELETE, "Álvarez",
    "Program Manager", "+1 9055550110", "9055550100", "ana@multimatic.com", "", "",
    "Partner", "Referral", "",
    "22 Mill Lane", "A-501", "Brighton", "Michigan", "48116", "United States",
    "Multimatic", "OEM Manufacturer", "", "", "",
    "199 Markham Road", "11", "Markham", "Ontario", "L3R 1B5", "Canada",
  ],
  [
    DELETE, "",
    "", "", "", "", "", "",
    "", "", "",
    "", "", "", "", "", "",
    "Halberd Engineering", "Supplier", "A company with nobody in it yet — leave the name columns blank.",
    "", "5195550177", "", "", "London", "Ontario", "N6A 3K7", "Canada",
  ],
];

const RELATIONSHIPS = ["Client", "Competitor", "Consultant", "Investor", "Lawyer",
  "Partner", "Private installer", "Prospect", "Other"];
const TYPES = ["Fleet", "Installer", "Institution", "OEM Manufacturer", "Parts Dealer",
  "Service", "Supplier", "Trailer Dealer", "Upfitter", "Other"];

const lists: string[][] = [
  ["How to fill this in"],
  [],
  ["One row per person. Fill in as much or as little as you have — a person needs only a first and a last name."],
  ["Delete the three EXAMPLE rows before sending the file back. Do not rename or reorder the columns."],
  [],
  ["The company columns"],
  ["Put the company on the person's own row. If it is already in the book, the person is linked to it;"],
  ["if it is not, it is created. Fill the company's own details in on the first row that names it and"],
  ["leave them blank on the rest. To add a company nobody works at yet, fill the company columns and"],
  ["leave both name columns blank."],
  [],
  ["What they are to us — what this person is to Opus Kap. Several are fine, separated by commas."],
  ...RELATIONSHIPS.map((r) => ["", r]),
  ["Anything else you type becomes a new one, so keep the spelling consistent down the column."],
  [],
  ["Company types — what the company is. Several are fine, separated by commas."],
  ...TYPES.map((t) => ["", t]),
  ["Anything else you type becomes a new one."],
  [],
  ["Phone numbers"],
  ["Type them however you have them — they are reformatted on the way in, so 3133040028 becomes"],
  ["(313)-304-0028. A number outside North America needs its country code: +52 5512345678."],
  ["A mobile needs 10 digits. An office line or a company main line needs 7."],
  [],
  ["Countries"],
  ["Write the country in full — United States, Canada, Mexico, Germany. USA, UK and DRC are understood."],
  ["A spelling that matches nothing is left off rather than stored, so the country filter stays clean."],
  [],
  ["Emails"],
  ["A person needs a phone or an email — one of the two is enough."],
];

const bytes = buildWorkbook([
  { name: "Contacts", rows: [headers, ...examples] },
  { name: "How to fill this in", rows: lists },
]);
const out = process.argv[2];
if (!out) {
  console.error("Usage: npx tsx scripts/make-import-template.ts <out.xlsx>");
  process.exit(1);
}
writeFileSync(out, bytes);
console.log("columns:", headers.length, "· example rows:", examples.length, "· bytes:", bytes.length);
