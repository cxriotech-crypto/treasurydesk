/* Runs the section 7.4 calculation checks. Exit code 1 on any failure. */
import { runCalcCases } from '../src/lib/calcCases';

const results = runCalcCases();
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.id}] ${r.name}`);
  for (const l of r.lines) {
    const mark = l.pass ? '    ok ' : '    XX ';
    console.log(`${mark}${l.label}: expected ${l.expected}${l.pass ? '' : `, got ${l.actual}`}`);
  }
}
const required = results.filter((r) => r.required);
const extra = results.filter((r) => !r.required);
const reqPass = required.filter((r) => r.pass).length;
const extraPass = extra.filter((r) => r.pass).length;
console.log('');
console.log(
  `${reqPass}/${required.length} required PASS · ${extraPass}/${extra.length} extra PASS`
);
if (reqPass !== required.length || extraPass !== extra.length) process.exit(1);
