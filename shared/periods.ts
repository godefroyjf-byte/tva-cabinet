export function quarterRange(year:number,quarter:number) {
  if(!Number.isInteger(year)||year<1900||year>2200)throw new Error('Choisissez une année entre 1900 et 2200.');
  if(!Number.isInteger(quarter)||quarter<1||quarter>4)throw new Error('Choisissez un trimestre de T1 à T4.');
  const start=String(quarter*3-2).padStart(2,'0'),end=String(quarter*3).padStart(2,'0');
  return {from:year+'-'+start+'-01',to:year+'-'+end+'-'+(quarter===2||quarter===3?'30':'31')};
}
