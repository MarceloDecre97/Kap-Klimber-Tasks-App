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
function sheetXml(rows: string[][], validations: Validation[] = []): string {
  const body = rows.map((cells, r) => {
    const rowNum = r + 1;
    const tds = cells.map((value, c) => value === "" ? ""
      : `<c r="${cellRef(c, rowNum)}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`).join("");
    return `<row r="${rowNum}">${tds}</row>`;
  }).join("");
  const width = Math.max(...rows.map((r) => r.length), 1);
  const lastCol = cellRef(width - 1, 1).replace(/\d+$/, "");
  /*
    showErrorMessage="0" is the whole point of these.

    A dropdown that refuses anything off the list would refuse "Fleet,
    Service" too, and several at once is exactly what these columns are for.
    Left as a warning-free suggestion, the arrow offers the spellings that
    exist and typing a second one past it still works.
  */
  const dv = validations.length
    ? `<dataValidations count="${validations.length}">${validations
        .map(
          (v) =>
            `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${v.ref}"><formula1>${escapeXml(v.formula)}</formula1></dataValidation>`
        )
        .join("")}</dataValidations>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData>${dv}<ignoredErrors><ignoredError sqref="A1:${lastCol}${rows.length}" numberStoredAsText="1"/></ignoredErrors></worksheet>`;
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
/** A dropdown over a range: an inline "a,b,c" list or a cross-sheet range. */
interface Validation {
  ref: string;
  formula: string;
}

interface Sheet {
  name: string;
  rows: string[][];
  validations?: Validation[];
}
function buildWorkbook(sheets: Sheet[]): Buffer {
  const safe = (n: string) => (n.replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet").slice(0, 31);
  const parts = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(s.rows, s.validations), "utf8") }));
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

/* -------------------------------------------------------------------------
   The template itself
   ------------------------------------------------------------------------- */

/*
  Two tabs, because a company belongs in one place.

  The first draft put a person and their company on one row, and took the
  company's details from the first row that named it. That reads well until
  two rows disagree about the same company, or a name is typed slightly
  differently on one of them — at which point the sheet quietly describes two
  companies and nothing can tell that it was a typo.

  Split, the Company column on the Contacts tab is a reference to a row on
  the Companies tab. A name that matches nothing there is then a question to
  ask rather than a second company to create.
*/

const DELETE = "EXAMPLE — delete this row";

const companyHeaders = [
  "Company name", "Company types", "What the company does", "Website", "Main line",
  /* The general inbox, not a person's — see 0036. */
  "Company email",
  "Street", "Suite", "City", "State / Province", "ZIP / Postal code", "Country",
  "Already in the book",
];

/*
  The companies the book already holds, written in full.

  They are here to be copied from rather than retyped: "ADV Mobil Inc." is a
  second company, and a near miss is the one mistake this sheet cannot catch
  for itself. Matching is done on the name, so the last column is a note to
  the reader and nothing more.
*/
const existingCompanies: string[][] = [
  ["ADV Mobil", "Upfitter", "Overland vehicle builder company.", "https://www.advmobil.com/",
    "(810)-818-1919", "", "1002 Packard Drive", "", "Howell", "Michigan", "48843", "United States", "yes"],
  ["Integrated Innovation Institute - Carnegie Mellon University", "Institution", "",
    "https://www.cmu.edu/iii/index.html", "+1 (844)-629-0200", "", "311 S Craig St", "", "Pittsburgh",
    "PA", "15213", "United States", "yes"],
  ["Perfect Drive GmbH Fahrschule Strebel", "Institution", "", "", "", "",
    "Diessenhoferstrasse 21", "", "Feuerthalen", "Switzerland", "8245", "", "yes"],
  ["Royal Truck & Utility Trailer", "Parts Dealer, Trailer Dealer, Upfitter",
    "Full-service truck and trailer dealer providing trailer sales, parts, repair, custom fabrication, and upfitting services for commercial transportation equipment.",
    "https://royaltrailersales.com/", "(313)-524-2529", "", "311 E. Cady St.", "", "Northville",
    "Michigan", "48167", "United States", "yes"],
];

/* Added by the first import; here so its spelling can be pointed at. */
const BRAZOS: string[] = [
  "Brazos Trailers", "Parts Dealer, Trailer Dealer",
  "They sell new and used trailers, trailers on consignment, and related trailer parts.",
  "https://brazostrailers.com/", "+1 (430)-540-3400", "",
  "22488 Interstate 20 N Access Rd", "", "Wills Point", "Texas", "75169", "United States", "yes",
];

const companyExamples: string[][] = [
  [DELETE, "Fleet, Service", "Regional refrigerated carrier.", "example-fleet.com", "5195550177",
    "info@example-fleet.com",
    "44 Wharncliffe Rd", "Unit 3", "London", "Ontario", "N6A 3K7", "Canada", ""],
  [DELETE, "Supplier", "A company nobody works at yet — a row here with no one on the Contacts tab is fine.",
    "", "2485550100", "", "", "", "Livonia", "Michigan", "48150", "United States", ""],
];

const contactHeaders = [
  "First name", "Last name", "Company",
  "Job title", "Mobile", "Office phone", "Email", "Second email", "Website",
  "What they are to us", "Where they came from", "Notes",
  "Their street", "Their suite", "Their city", "Their state / province",
  "Their ZIP / postal code", "Their country",
];

const contactExamples: string[][] = [
  [DELETE, "Morrison", "Royal Truck & Utility Trailer",
    "Vice President of Aftermarket Sales", "3133040028", "", "mike@royaltruck.com", "", "",
    "Client", "Trade show", "Met at Work Truck Week.",
    "", "", "", "", "", ""],
  [DELETE, "Álvarez", "",
    "Program Manager", "+1 9055550110", "9055550100", "ana@multimatic.com", "", "",
    "Partner, Consultant", "Referral", "No company — the Company column can be left blank.",
    "22 Mill Lane", "A-501", "Brighton", "Michigan", "48116", "United States"],
];

const RELATIONSHIPS = ["Client", "Competitor", "Consultant", "Investor", "Lawyer",
  "Partner", "Private installer", "Prospect", "Other"];
const TYPES = ["Fleet", "Installer", "Institution", "OEM Manufacturer", "Parts Dealer",
  "Service", "Supplier", "Trailer Dealer", "Upfitter", "Other"];

/** Already in the book, so already spoken for. */
const EXISTING_PEOPLE = [
  "Eric Housman — ADV Mobil",
  "Mike Lynch — ADV Mobil",
  "Sheena Carchedi — ADV Mobil",
  "Mike Morrison — Royal Truck & Utility Trailer",
  "Jenny Hurst — Integrated Innovation Institute - Carnegie Mellon University",
  "Marcel Strebel — Perfect Drive GmbH Fahrschule Strebel",
  "Mandy Pool — Brazos Trailers",
];

const guide: string[][] = [
  ["How to fill this in"],
  [],
  ["Two tabs. Fill in the Companies tab first, then the Contacts tab."],
  ["Delete the EXAMPLE rows from both before sending the file back."],
  ["Do not rename or reorder the columns. Extra columns of your own can be added at the far right."],
  [],
  ["How the two tabs are joined"],
  ["The Company column on the Contacts tab must match a Company name on the Companies tab, spelled"],
  ["the same way. That is the whole link. A name that matches nothing gets reported back to you"],
  ["rather than guessed at, so a typo costs a question and not a duplicate company."],
  ["A person with no company: leave the Company column blank."],
  ["A company with nobody in it yet: put it on the Companies tab and on no contact row."],
  [],
  ["Already in the book"],
  ["The first five rows of the Companies tab are in the book already. They are there so a person"],
  ["can point at them without the name being retyped. Leave them as they are — or correct a detail"],
  ["and the record gets corrected too. Nothing is created twice: matching is done on the name."],
  [],
  ["Company email is the general inbox — info@, sales@. A person's own address goes on their row."],
  [],
  ["These seven people are in the book already. Adding them again would make a second copy:"],
  ...EXISTING_PEOPLE.map((p) => ["", p]),
  [],
  ["Dropdowns"],
  ["Company types, What they are to us, and the Company column all have a dropdown arrow. Pick from"],
  ["it and the spelling is right by construction. They do not refuse anything, so a second value can"],
  ["still be typed after the first: Fleet, Service."],
  [],
  ["What they are to us — what a person is to Opus Kap. Several are fine, separated by commas."],
  ...RELATIONSHIPS.map((r) => ["", r]),
  ["Anything else becomes a new one, so keep the spelling consistent down the column."],
  [],
  ["Company types — what a company is. Several are fine, separated by commas."],
  ...TYPES.map((t) => ["", t]),
  ["Anything else becomes a new one."],
  [],
  ["Phone numbers"],
  ["Type them however you have them — they are reformatted on the way in, so 3133040028 becomes"],
  ["(313)-304-0028. A number outside North America needs its country code: +41 793573300."],
  ["A mobile needs 10 digits. An office line or a company main line needs 7."],
  [],
  ["Countries"],
  ["Write the country in full — United States, Canada, Mexico, Germany. USA, UK and DRC are understood."],
  ["A spelling that matches nothing is left off rather than stored, so the country filter stays clean."],
  ["The country goes in the Country column, not the State one."],
  [],
  ["Emails"],
  ["A person needs a phone or an email — one of the two is enough. Blank cells are fine everywhere else."],
];

/*
  How far down the dropdowns reach. Generous on purpose: a row pasted in
  below the last one the template drew still gets the arrow, and an unused
  row costs nothing.
*/
const DROPDOWN_ROWS = 800;

/** An inline list, quoted the way Excel wants it. Capped at 255 characters. */
function inlineList(values: string[]): string {
  const formula = `"${values.join(",")}"`;
  if (formula.length > 255) {
    throw new Error(`Dropdown list is ${formula.length} characters; Excel allows 255.`);
  }
  return formula;
}

const bytes = buildWorkbook([
  {
    name: "Companies",
    rows: [companyHeaders, ...existingCompanies, BRAZOS, ...companyExamples],
    // Company types is column B.
    validations: [{ ref: `B2:B${DROPDOWN_ROWS}`, formula: inlineList(TYPES) }],
  },
  {
    name: "Contacts",
    rows: [contactHeaders, ...contactExamples],
    validations: [
      /*
        The Company column picks from the Companies tab rather than from a
        list written twice. This is the join, so an arrow here is worth more
        than the other two put together: a company chosen from the sheet
        cannot be a company misspelled.
      */
      { ref: `C2:C${DROPDOWN_ROWS}`, formula: `Companies!$A$2:$A$${DROPDOWN_ROWS}` },
      // What they are to us is column J.
      { ref: `J2:J${DROPDOWN_ROWS}`, formula: inlineList(RELATIONSHIPS) },
    ],
  },
  { name: "How to fill this in", rows: guide },
]);

const out = process.argv[2];
if (!out) {
  console.error("Usage: npx tsx scripts/make-import-template.ts <out.xlsx>");
  process.exit(1);
}
writeFileSync(out, bytes);
console.log(
  `Companies: ${companyHeaders.length} cols, ${existingCompanies.length} existing + ${companyExamples.length} examples`
);
console.log(`Contacts: ${contactHeaders.length} cols, ${contactExamples.length} examples`);
console.log(`${out} · ${bytes.length} bytes`);
