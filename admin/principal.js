migrateImagesToIndexedDB(DB_KEY).catch(err=>console.warn("Migración de imágenes:",err));
document.addEventListener("click",e=>{const b=e.target.closest("[data-close]");if(b)document.getElementById(b.dataset.close).classList.add("hidden")});
render();
