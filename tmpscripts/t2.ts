const re = /^(redshirt\s+[A-Za-z]+|[A-Za-z]+)\s+(\d)\s+(\d{1,2})\s+(\d{2,3})\s*lbs?\.?$/i;
for (const s of ["Senior 6 2 200 lbs","Freshman 6 0 170 lbs"]) console.log(s, re.exec(s));
const pos = /^([A-Za-z]{1,4}(?:\s*\/\s*[A-Za-z]{1,4}){0,3})\s+(.+)$/;
console.log(pos.exec("Senior 6 2 200 lbs"));
