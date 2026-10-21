// Texto legible en la columna description existente; compatible con el catálogo actual.
const PRODUCT_SPECIFICATIONS_HEADING="Características técnicas:";
function splitProductDescription(value){
  const text=String(value??"").replace(/\r\n?/g,"\n");
  const heading=/^caracter[ií]sticas t[eé]cnicas:[\t ]*$/im.exec(text);
  return heading
    ?{description:text.slice(0,heading.index).trim(),specifications:text.slice(heading.index+heading[0].length).trim()}
    :{description:text.trim(),specifications:""};
}
function composeProductDescription(description,specifications){
  const summary=String(description??"").trim(),details=String(specifications??"").trim();
  return [summary,details?PRODUCT_SPECIFICATIONS_HEADING+"\n"+details:""].filter(Boolean).join("\n\n");
}
function productSpecificationRows(value){
  return String(value??"").split(/\r?\n/).map(line=>line.trim().replace(/^[-•]\s+/,"")).filter(Boolean).map(line=>{
    const separator=line.indexOf(":");
    return separator>0&&line.slice(separator+1).trim()
      ?{label:line.slice(0,separator).trim(),value:line.slice(separator+1).trim()}
      :{label:"",value:line};
  });
}
