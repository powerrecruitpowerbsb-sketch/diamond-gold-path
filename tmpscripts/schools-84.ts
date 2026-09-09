/** The 84 schools authorised for the page re-check. Nothing else is touched. */
export const SCHOOLS_84 = `Allan Hancock College
Amherst College
Baker University
CCBC-Essex
Cayuga Community College
Central Arizona College
Central Baptist College
Centralia College
Chapman University
Citrus College
Colorado Northwestern Community College
Copiah-Lincoln Community College
Covenant College
Crowder College
Cuyahoga Community College
DePauw University
Doane College
Eastfield College
El Camino College
Elon University
Fairleigh Dickinson University, Florham
Fayetteville State University
Gadsden State Community College
Garden City Community College
Gaston College
Georgetown College
Georgetown University
Gettysburg College
Graceland University
Holyoke Community College
Howard College
Illinois College
Illinois Wesleyan University
Imperial Valley College
Indian River State College
Irvine Valley College
Jarvis Christian University
King University
Lackawanna College
Lake Land College
Lansing Community College
Linn–Benton Community College
Lorain County Community College
Los Angeles Harbor College
Los Angeles Valley College
Lyon College
Marietta College
Marion Military Institute
Massachusetts Maritime Academy
McPherson College
Mendocino College
Mesa Community College
Mineral Area College
Mississippi Gulf Coast Community College
Mitchell College
North Idaho College
Ohlone College
Olivet Nazarene University
Otterbein University
Palm Beach State College
Palomar College
Panola College
Patrick & Henry Community College
Penn State University, Altoona
Pima Community College
Ranger College
Rockford University
Seward County Community College
Southern Union State Community College
Spartanburg Methodist College
Sterling College
Sul Ross State University
Surry Community College
Sussex County Community College
Tallahassee Community College
Texas A&M University–San Antonio
Treasure Valley Community College
University of Alabama in Huntsville
University of Pikeville
University of Saint Joseph (Connecticut)
University of Valley Forge
Utica University
Waldorf University
Wallace State Community College`
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
