import { splitHometown } from "../src/lib/hometown-split";
const cases = ["Tampa, FL","Tampa, Fla.","Tampa, Florida","St. Louis, Mo.","Toronto, ON, Canada","Tokyo, Japan","Tampa","Newport Beach, Calif.","Hoover, Ala. / Hoover HS","Lakeland, FL.","Miami, Fl","Cary, N.C.","Wall, N.J.","Omaha, Neb.","Sioux Falls, S.D.","Honolulu, HI","Buford, GA.","Frisco, Texas","Aiea, Hawai'i"];
for (const c of cases) console.log(JSON.stringify(c), JSON.stringify(splitHometown(c)));
