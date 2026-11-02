import { expect, test } from "bun:test";

import { toCsv } from "./csv";

test("quotes what would break a row", () => {
  expect(toCsv([["a,b", 'say "hi"', "line\nbreak"]])).toBe('"a,b","say ""hi""","line\nbreak"');
});

test("a guest's typed formula stays text in a spreadsheet", () => {
  expect(toCsv([['=HYPERLINK("http://evil")', "+263771234567", "-1", "@me"]])).toBe(
    `"'=HYPERLINK(""http://evil"")",'+263771234567,'-1,'@me`,
  );
});

test("numbers and blanks pass through", () => {
  expect(toCsv([[120, -5, null, undefined]])).toBe("120,-5,,");
});
