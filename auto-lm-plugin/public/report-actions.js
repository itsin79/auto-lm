"use strict";
document.getElementById("print-report")?.addEventListener("click", async () => {
  await Promise.all([...document.images].map(image=>image.decode?.().catch(()=>{})));
  window.print();
});
